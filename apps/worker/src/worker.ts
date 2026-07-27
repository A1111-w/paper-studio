import {
  DEFAULT_QUEUE_NAME,
  processGenerationJob,
  redisConnection,
  type GenerationJobData,
  type GenerationJobResult,
} from "@wenhe/api/jobs";
import { Worker, type Job } from "bullmq";

interface WorkerConfig {
  redisUrl: string;
  queueName: string;
  concurrency: number;
  shutdownTimeoutMs: number;
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const redisUrl = env.REDIS_URL?.trim() ?? "";
  if (!redisUrl) throw new Error("REDIS_URL is required for the BullMQ worker");
  return {
    redisUrl,
    queueName: env.GENERATION_QUEUE_NAME?.trim() || DEFAULT_QUEUE_NAME,
    concurrency: boundedInteger(env.WORKER_CONCURRENCY ?? env.AI_MAX_CONCURRENCY, 3, 1, 10),
    shutdownTimeoutMs: boundedInteger(env.WORKER_SHUTDOWN_TIMEOUT_MS, 30_000, 1_000, 120_000),
  };
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), service: "wenhe-worker", event, ...fields })}\n`);
}

function logError(event: string, error: unknown, fields: Record<string, unknown> = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), service: "wenhe-worker", event, message, ...fields })}\n`);
}

async function runGenerationJob(job: Job<GenerationJobData, GenerationJobResult>): Promise<GenerationJobResult> {
  if (!job.id) throw new Error("BullMQ generation job is missing its job id");
  return processGenerationJob(job.data, (progress) => job.updateProgress(progress), job.id);
}

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const worker = new Worker<GenerationJobData, GenerationJobResult>(config.queueName, runGenerationJob, {
    connection: redisConnection(config.redisUrl),
    concurrency: config.concurrency,
    maxStalledCount: 2,
    stalledInterval: 30_000,
  });

  worker.on("active", (job) => log("job.active", { jobId: job.id }));
  worker.on("completed", (job, result) => log("job.completed", {
    jobId: job.id,
    outputBytes: result.outputBytes,
    model: result.model,
  }));
  worker.on("failed", (job, error) => logError("job.failed", error, { jobId: job?.id }));
  worker.on("stalled", (jobId) => logError("job.stalled", "Job lock was lost and the job will be retried", { jobId }));
  worker.on("error", (error) => logError("worker.error", error));

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("worker.stopping", { signal });

    const forceTimer = setTimeout(() => {
      logError("worker.force-close", `Graceful shutdown exceeded ${config.shutdownTimeoutMs}ms`, { signal });
      process.exitCode = 1;
      void worker.close(true).catch((error) => logError("worker.force-close-error", error));
    }, config.shutdownTimeoutMs);

    try {
      await worker.close();
      if (process.exitCode === undefined) process.exitCode = 0;
      log("worker.stopped", { signal });
    } catch (error) {
      process.exitCode = 1;
      logError("worker.stop-error", error, { signal });
      await worker.close(true).catch((closeError) => logError("worker.force-close-error", closeError));
    } finally {
      clearTimeout(forceTimer);
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await worker.waitUntilReady();
  log("worker.ready", {
    queueName: config.queueName,
    concurrency: config.concurrency,
  });
}

void main().catch((error) => {
  logError("worker.start-error", error);
  process.exitCode = 1;
});
