import { createReadStream } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { providersFromEnv } from "@wenhe/ai";
import { AcademicStyleSchema, PageSetupSchema } from "@wenhe/contracts";
import { extractTemplateStyles } from "@wenhe/document";
import { type AppConfig } from "./config.js";
import { createGenerationQueue, QueueCapacityError } from "./jobs.js";

const LoginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(8).max(200) }).strict();
const GenerationSchema = z.object({
  topic: z.string().trim().min(2).max(300),
  requirements: z.string().trim().min(2).max(20_000),
  providerId: z.enum(["smart", "mock", "deepseek", "relay"]).default("smart"),
  author: z.string().trim().max(120).optional(),
  institution: z.string().trim().max(200).optional(),
  outline: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  targetCharacters: z.number().int().min(500).max(100_000).optional(),
  styleHints: AcademicStyleSchema.removeDefault().partial().strict().optional(),
  pageHints: PageSetupSchema.removeDefault().partial().strict().optional(),
}).strict();
const GenerationIdSchema = z.string().regex(/^(?:[0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu);

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: 256 * 1024,
    requestIdHeader: "x-request-id",
    trustProxy: false,
  });
  const queue = createGenerationQueue({
    redisUrl: config.redisUrl,
    queueName: config.queueName,
    outputDir: config.outputDir,
    maxConcurrency: config.maxConcurrency,
    mockMode: config.mockMode,
  });

  app.addHook("onClose", async () => {
    await queue.close();
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
      else callback(new Error("Origin not allowed"), false);
    },
  });
  await app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: "2h" } });
  await app.register(multipart, {
    limits: { files: 1, fileSize: 20 * 1024 * 1024, fields: 4, parts: 5 },
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute", ban: 3 });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      void reply.code(400).send({ error: "INVALID_INPUT", issues: error.issues });
      return;
    }
    if (error instanceof QueueCapacityError) {
      void reply.code(429).send({ error: "QUEUE_CAPACITY", message: error.message });
      return;
    }
    const statusCode = typeof error === "object"
      && error !== null
      && "statusCode" in error
      && typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
    if (statusCode >= 400 && statusCode < 500) {
      void reply.code(statusCode).send({ error: statusCode === 403 ? "FORBIDDEN" : "REQUEST_REJECTED" });
      return;
    }
    app.log.error(error);
    void reply.code(500).send({ error: "INTERNAL_ERROR" });
  });

  app.get("/health", async () => ({ ok: true, service: "wenhe-api", time: new Date().toISOString() }));

  app.post("/v1/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    if (!config.demoAuthEnabled) return reply.code(503).send({ error: "PASSWORD_AUTH_DISABLED" });
    const input = LoginSchema.parse(request.body);
    const account = matchDemoAccount(input, config);
    if (!account) return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    const token = await reply.jwtSign(account);
    return { token, user: account, expiresInSeconds: 7200 };
  });

  app.post("/v1/auth/wechat", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { code } = z.object({ code: z.string().trim().min(6).max(256) }).strict().parse(request.body);
    if (!config.wechatAppId || !config.wechatAppSecret) {
      return reply.code(503).send({ error: "WECHAT_AUTH_NOT_CONFIGURED" });
    }
    const session = await exchangeWechatCode(code, config);
    const sub = `wechat-${createHash("sha256").update(session.openid).digest("hex").slice(0, 24)}`;
    const user = { sub, email: `${sub}@wechat.local`, role: "user" as const };
    const token = await reply.jwtSign(user);
    return {
      token,
      user: { id: sub, nickname: "微信用户", balance: 0, generatedCount: (await queue.list(sub)).filter((job) => job.status === "succeeded").length },
      expiresInSeconds: 7200,
    };
  });

  app.get("/v1/me", { preHandler: authenticate }, async (request) => ({
    id: request.user.sub,
    nickname: request.user.email.endsWith("@wechat.local") ? "微信用户" : request.user.email.split("@")[0],
    balance: 0,
    generatedCount: (await queue.list(request.user.sub)).filter((job) => job.status === "succeeded").length,
  }));

  app.get("/v1/providers", { preHandler: authenticate }, async () => ({
    providers: [
      { id: "mock", label: "本地演示", enabled: config.mockMode },
      ...providersFromEnv().map((provider) => ({ id: provider.id, label: provider.label, model: provider.model, enabled: true })),
    ],
  }));

  app.post("/v1/templates/extract", {
    preHandler: authenticate,
    config: { rateLimit: { max: 6, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const upload = await request.file();
    if (!upload || !upload.filename.toLowerCase().endsWith(".docx")) {
      return reply.code(400).send({ error: "DOCX_FILE_REQUIRED" });
    }
    const buffer = await upload.toBuffer();
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return reply.code(400).send({ error: "INVALID_DOCX_SIGNATURE" });
    }
    const profile = await extractTemplateStyles(buffer);
    return {
      template: {
        fileName: upload.filename.slice(0, 200),
        profile,
        suggestedStyle: suggestedStyleFromProfile(profile),
      },
    };
  });

  app.post("/v1/generations", {
    preHandler: authenticate,
    config: { rateLimit: { max: 12, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const input = GenerationSchema.parse(request.body);
    const idempotencyKey = readIdempotencyKey(request);
    const job = await queue.enqueue(request.user.sub, input.providerId, idempotencyKey, input);
    return reply.code(202).send({ job });
  });

  app.get("/v1/generations", { preHandler: authenticate }, async (request) => ({ jobs: await queue.list(request.user.sub) }));

  app.get("/v1/generations/:id", { preHandler: authenticate }, async (request, reply) => {
    const id = GenerationIdSchema.parse((request.params as { id: string }).id);
    const job = await queue.get(id, request.user.sub);
    if (!job) return reply.code(404).send({ error: "JOB_NOT_FOUND" });
    return { job };
  });

  app.get("/v1/generations/:id/download", { preHandler: authenticate }, async (request, reply) => {
    const id = GenerationIdSchema.parse((request.params as { id: string }).id);
    const job = await queue.get(id, request.user.sub);
    if (!job || job.status !== "succeeded" || !job.outputFile) return reply.code(404).send({ error: "OUTPUT_NOT_FOUND" });
    reply.header("content-type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    reply.header("content-disposition", `attachment; filename="${job.id}.docx"`);
    return reply.send(createReadStream(job.outputFile));
  });

  app.get("/v1/billing/status", { preHandler: authenticate }, async () => ({
    enabled: false,
    state: "reserved",
    message: "充值能力尚未启用，账本与支付 provider 接口将在支付方案确定后接入。",
  }));

  app.get("/v1/plagiarism/status", { preHandler: authenticate }, async () => ({
    enabled: false,
    state: "reserved",
    message: "查重接口尚未启用。",
  }));

  app.get("/v1/admin/overview", { preHandler: [authenticate, requireAdmin] }, async () => ({
    jobs: await queue.overview(),
    providers: providersFromEnv().map(({ id, label, model, baseUrl }) => ({ id, label, model, host: new URL(baseUrl).host })),
    featureFlags: { billing: false, plagiarism: false },
  }));

  return app;
}

async function authenticate(request: FastifyRequest) {
  await request.jwtVerify();
}

async function requireAdmin(request: FastifyRequest) {
  if (request.user.role !== "admin") throw Object.assign(new Error("Admin role required"), { statusCode: 403 });
}

function readIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/u.test(value)) {
    throw new z.ZodError([{ code: "custom", path: ["headers", "idempotency-key"], message: "A valid Idempotency-Key header is required" }]);
  }
  return value;
}

function matchDemoAccount(input: z.infer<typeof LoginSchema>, config: AppConfig) {
  const candidates = [
    { sub: "demo-user", email: config.demoUserEmail, password: config.demoUserPassword, role: "user" as const },
    { sub: "demo-admin", email: config.demoAdminEmail, password: config.demoAdminPassword, role: "admin" as const },
  ];
  const match = candidates.find((account) => account.email.toLowerCase() === input.email.toLowerCase());
  if (!match || !safeEqual(match.password, input.password)) return null;
  return { sub: match.sub, email: match.email, role: match.role };
}

function safeEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

function suggestedStyleFromProfile(profile: Awaited<ReturnType<typeof extractTemplateStyles>>) {
  const normal = profile.paragraphStyles.find((style) => /^(normal|正文)$/iu.test(style.name))?.run;
  const title = profile.paragraphStyles.find((style) => /^(title|标题)$/iu.test(style.name))?.run;
  const body = { ...profile.defaults.run, ...normal };
  return {
    eastAsiaBodyFont: body.eastAsiaFont,
    latinBodyFont: body.asciiFont,
    bodySizePt: body.sizePt,
    headingFont: title?.eastAsiaFont || title?.asciiFont,
    titleSizePt: title?.sizePt,
  };
}

async function exchangeWechatCode(code: string, config: AppConfig): Promise<{ openid: string; session_key: string }> {
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", config.wechatAppId);
  url.searchParams.set("secret", config.wechatAppSecret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw Object.assign(new Error("WeChat authentication service failed"), { statusCode: 502 });
  const payload = await response.json() as { openid?: string; session_key?: string; errcode?: number; errmsg?: string };
  if (!payload.openid || !payload.session_key) {
    throw Object.assign(new Error(`WeChat login rejected: ${payload.errcode || "unknown"} ${payload.errmsg || ""}`), { statusCode: 401 });
  }
  return { openid: payload.openid, session_key: payload.session_key };
}
