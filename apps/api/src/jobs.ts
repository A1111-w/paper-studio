import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  MockDocumentProvider,
  OpenAICompatibleDocumentProvider,
  providersFromEnv,
  type ArticleRequest,
  type DocumentProvider,
} from "@wenhe/ai";
import { renderDocumentToFile } from "@wenhe/document";
import { Queue, type ConnectionOptions, type Job } from "bullmq";

export const DEFAULT_QUEUE_NAME = "wenhe-generation";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface GenerationJob {
  id: string;
  userId: string;
  providerId: string;
  topic: string;
  status: JobStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  outputFile?: string;
  outputBytes?: number;
  error?: string;
  model?: string;
}

export interface GenerationJobData {
  userId: string;
  providerId: string;
  request: ArticleRequest;
  outputDir: string;
  mockMode: boolean;
}

export interface GenerationJobResult {
  outputFile: string;
  outputBytes: number;
  model: string;
}

export interface GenerationQueueAdapter {
  enqueue(userId: string, providerId: string, idempotencyKey: string, request: ArticleRequest): Promise<GenerationJob>;
  get(id: string, userId: string, isAdmin?: boolean): Promise<GenerationJob | null>;
  list(userId: string, isAdmin?: boolean): Promise<GenerationJob[]>;
  overview(): Promise<{ total: number; queued: number; running: number; succeeded: number; failed: number; activeWorkers: number; maxConcurrency: number; mode: "inline" | "redis" }>;
  close(): Promise<void>;
}

interface QueueItem {
  job: GenerationJob;
  request: ArticleRequest;
}

export class InlineGenerationQueue implements GenerationQueueAdapter {
  private readonly jobs = new Map<string, GenerationJob>();
  private readonly idempotency = new Map<string, string>();
  private readonly pending: QueueItem[] = [];
  private active = 0;

  constructor(
    private readonly outputDir: string,
    private readonly maxConcurrency: number,
    private readonly mockMode: boolean,
  ) {}

  async enqueue(userId: string, providerId: string, idempotencyKey: string, request: ArticleRequest): Promise<GenerationJob> {
    const key = `${userId}:${idempotencyKey}`;
    const existingId = this.idempotency.get(key);
    if (existingId) return { ...this.jobs.get(existingId)! };
    const userOpenJobs = [...this.jobs.values()].filter((job) => job.userId === userId && ["queued", "running"].includes(job.status));
    if (userOpenJobs.length >= 5) throw new QueueCapacityError("Each user may have at most five open generation jobs");
    if (this.pending.length >= 100) throw new QueueCapacityError("Generation queue is full");

    const now = new Date().toISOString();
    const job: GenerationJob = {
      id: randomUUID(), userId, providerId, topic: request.topic,
      status: "queued", progress: 0, createdAt: now, updatedAt: now,
    };
    this.jobs.set(job.id, job);
    this.idempotency.set(key, job.id);
    this.pending.push({ job, request });
    queueMicrotask(() => void this.drain());
    return { ...job };
  }

  async get(id: string, userId: string, isAdmin = false): Promise<GenerationJob | null> {
    const job = this.jobs.get(id);
    return !job || (!isAdmin && job.userId !== userId) ? null : { ...job };
  }

  async list(userId: string, isAdmin = false): Promise<GenerationJob[]> {
    return [...this.jobs.values()]
      .filter((job) => isAdmin || job.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((job) => ({ ...job }));
  }

  async overview() {
    const jobs = [...this.jobs.values()];
    return {
      total: jobs.length,
      queued: jobs.filter((job) => job.status === "queued").length,
      running: jobs.filter((job) => job.status === "running").length,
      succeeded: jobs.filter((job) => job.status === "succeeded").length,
      failed: jobs.filter((job) => job.status === "failed").length,
      activeWorkers: this.active,
      maxConcurrency: this.maxConcurrency,
      mode: "inline" as const,
    };
  }

  async close(): Promise<void> {}

  private async drain(): Promise<void> {
    while (this.active < this.maxConcurrency && this.pending.length) {
      const item = this.pending.shift()!;
      this.active += 1;
      void this.run(item).finally(() => {
        this.active -= 1;
        void this.drain();
      });
    }
  }

  private async run({ job, request }: QueueItem): Promise<void> {
    this.patch(job, { status: "running", progress: 10 });
    try {
      const result = await processGenerationJob(
        { userId: job.userId, providerId: job.providerId, request, outputDir: this.outputDir, mockMode: this.mockMode },
        (progress) => this.patch(job, { progress }),
        job.id,
      );
      this.patch(job, { status: "succeeded", progress: 100, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown generation error";
      this.patch(job, { status: "failed", progress: 100, error: message.slice(0, 500) });
    }
  }

  private patch(job: GenerationJob, patch: Partial<GenerationJob>): void {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  }
}

export class RedisGenerationQueue implements GenerationQueueAdapter {
  private readonly queue: Queue<GenerationJobData, GenerationJobResult>;

  constructor(
    redisUrl: string,
    queueName: string,
    private readonly outputDir: string,
    private readonly maxConcurrency: number,
    private readonly mockMode: boolean,
  ) {
    this.queue = new Queue(queueName, {
      connection: redisConnection(redisUrl),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1_500 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 5_000 },
        removeOnFail: { age: 30 * 24 * 60 * 60, count: 10_000 },
      },
    });
  }

  async enqueue(userId: string, providerId: string, idempotencyKey: string, request: ArticleRequest): Promise<GenerationJob> {
    const counts = await this.queue.getJobCounts("wait", "active", "delayed");
    if ((counts.wait || 0) + (counts.active || 0) + (counts.delayed || 0) >= 1_000) {
      throw new QueueCapacityError("Generation queue is full");
    }
    const existingOpen = await this.queue.getJobs(["wait", "active", "delayed"], 0, 999, false);
    if (existingOpen.filter((job) => job.data.userId === userId).length >= 5) {
      throw new QueueCapacityError("Each user may have at most five open generation jobs");
    }
    const jobId = createHash("sha256").update(`${userId}:${idempotencyKey}`).digest("hex");
    const existing = await this.queue.getJob(jobId);
    if (existing) return mapBullJob(existing);
    const job = await this.queue.add("generate-document", {
      userId, providerId, request, outputDir: this.outputDir, mockMode: this.mockMode,
    }, { jobId });
    return mapBullJob(job);
  }

  async get(id: string, userId: string, isAdmin = false): Promise<GenerationJob | null> {
    const job = await this.queue.getJob(id);
    if (!job || (!isAdmin && job.data.userId !== userId)) return null;
    return mapBullJob(job);
  }

  async list(userId: string, isAdmin = false): Promise<GenerationJob[]> {
    // The public API exposes a bounded recent history. Full operational history belongs in the database/audit sink.
    const jobs = await this.queue.getJobs(["wait", "active", "delayed", "completed", "failed"], 0, 199, false);
    const mapped = await Promise.all(jobs.filter((job) => isAdmin || job.data.userId === userId).map(mapBullJob));
    return mapped.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async overview() {
    const counts = await this.queue.getJobCounts("wait", "active", "delayed", "completed", "failed");
    const queued = (counts.wait || 0) + (counts.delayed || 0);
    const running = counts.active || 0;
    const succeeded = counts.completed || 0;
    const failed = counts.failed || 0;
    return {
      total: queued + running + succeeded + failed,
      queued,
      running,
      succeeded,
      failed,
      activeWorkers: running,
      maxConcurrency: this.maxConcurrency,
      mode: "redis" as const,
    };
  }

  async close(): Promise<void> { await this.queue.close(); }
}

export function createGenerationQueue(options: {
  redisUrl: string;
  queueName: string;
  outputDir: string;
  maxConcurrency: number;
  mockMode: boolean;
}): GenerationQueueAdapter {
  return options.redisUrl
    ? new RedisGenerationQueue(options.redisUrl, options.queueName, options.outputDir, options.maxConcurrency, options.mockMode)
    : new InlineGenerationQueue(options.outputDir, options.maxConcurrency, options.mockMode);
}

export async function processGenerationJob(
  data: GenerationJobData,
  updateProgress: (progress: number) => void | Promise<void>,
  jobId: string,
): Promise<GenerationJobResult> {
  await updateProgress(10);
  const provider = resolveProvider(data.providerId, data.mockMode);
  const result = await provider.generate(data.request);
  await updateProgress(72);
  await mkdir(data.outputDir, { recursive: true });
  const rendered = await renderDocumentToFile(result.document, join(data.outputDir, jobId));
  await updateProgress(100);
  return { outputFile: rendered.path, outputBytes: rendered.bytes, model: result.model };
}

function resolveProvider(providerId: string, mockMode: boolean): DocumentProvider {
  if (mockMode || providerId === "mock") return new MockDocumentProvider();
  const providers = providersFromEnv();
  const selectedId = providerId === "smart"
    ? (providers.find((provider) => provider.id === "deepseek")?.id || providers[0]?.id)
    : providerId;
  if (!selectedId) return new MockDocumentProvider();
  const config = providers.find((provider) => provider.id === selectedId);
  if (!config) throw new Error(`Provider ${providerId} is not configured`);
  return new OpenAICompatibleDocumentProvider(config);
}

async function mapBullJob(job: Job<GenerationJobData, GenerationJobResult>): Promise<GenerationJob> {
  const state = await job.getState();
  const status: JobStatus = state === "active" ? "running" : state === "completed" ? "succeeded" : state === "failed" ? "failed" : "queued";
  const result = job.returnvalue || undefined;
  return {
    id: job.id || "",
    userId: job.data.userId,
    providerId: job.data.providerId,
    topic: job.data.request.topic,
    status,
    progress: typeof job.progress === "number" ? job.progress : 0,
    createdAt: new Date(job.timestamp).toISOString(),
    updatedAt: new Date(job.finishedOn || job.processedOn || job.timestamp).toISOString(),
    outputFile: result?.outputFile,
    outputBytes: result?.outputBytes,
    model: result?.model,
    error: job.failedReason || undefined,
  };
}

export function redisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  if (!["redis:", "rediss:"].includes(url.protocol)) throw new Error("REDIS_URL must use redis:// or rediss://");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export class QueueCapacityError extends Error {}
