import { resolve } from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  jwtSecret: string;
  corsOrigins: string[];
  outputDir: string;
  mockMode: boolean;
  maxConcurrency: number;
  demoUserEmail: string;
  demoUserPassword: string;
  demoAdminEmail: string;
  demoAdminPassword: string;
  demoAuthEnabled: boolean;
  wechatAppId: string;
  wechatAppSecret: string;
  redisUrl: string;
  queueName: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const jwtSecret = env.JWT_SECRET || "local-development-secret-change-before-production";
  if (env.NODE_ENV === "production" && jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters in production");
  }
  if (env.NODE_ENV === "production" && /^local-development-secret/i.test(jwtSecret)) {
    throw new Error("JWT_SECRET must be replaced before production deployment");
  }
  const demoAuthEnabled = env.DEMO_AUTH_ENABLED === "true" || (env.NODE_ENV !== "production" && env.DEMO_AUTH_ENABLED !== "false");
  const demoValues = [env.DEMO_USER_EMAIL, env.DEMO_USER_PASSWORD, env.DEMO_ADMIN_EMAIL, env.DEMO_ADMIN_PASSWORD];
  if (env.NODE_ENV === "production" && demoAuthEnabled && (
    demoValues.some((value) => !value || value.startsWith("replace-"))
    || env.DEMO_USER_EMAIL === "writer@local.test"
    || env.DEMO_ADMIN_EMAIL === "admin@local.test"
  )) {
    throw new Error("Set non-default DEMO_* credentials or set DEMO_AUTH_ENABLED=false in production");
  }
  return {
    host: env.HOST || "127.0.0.1",
    port: clampInteger(env.PORT, 3100, 1, 65_535),
    jwtSecret,
    corsOrigins: splitList(env.CORS_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173"),
    outputDir: resolve(env.OUTPUT_DIR || "storage/generated"),
    mockMode: env.AI_MOCK_MODE !== "false",
    maxConcurrency: clampInteger(env.AI_MAX_CONCURRENCY, 3, 1, 10),
    demoUserEmail: env.DEMO_USER_EMAIL || "writer@local.test",
    demoUserPassword: env.DEMO_USER_PASSWORD || "writer-demo-password",
    demoAdminEmail: env.DEMO_ADMIN_EMAIL || "admin@local.test",
    demoAdminPassword: env.DEMO_ADMIN_PASSWORD || "admin-demo-password",
    demoAuthEnabled,
    wechatAppId: env.WECHAT_APP_ID || "",
    wechatAppSecret: env.WECHAT_APP_SECRET || "",
    redisUrl: env.REDIS_URL || "",
    queueName: env.GENERATION_QUEUE_NAME || "wenhe-generation",
  };
}

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function clampInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
