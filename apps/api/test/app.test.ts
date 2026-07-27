import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";

const openApps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("API", () => {
  it("rejects generation without authentication", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "POST", url: "/v1/generations", payload: {} });
    expect(response.statusCode).toBe(401);
  });

  it("generates and downloads a deterministic DOCX", async () => {
    const app = await createApp();
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "writer@local.test", password: "writer-demo-password" },
    });
    const token = login.json().token as string;
    const created = await app.inject({
      method: "POST",
      url: "/v1/generations",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "test-generation-001" },
      payload: { topic: "高校数字化教学研究", requirements: "生成结构化论文演示", providerId: "mock" },
    });
    expect(created.statusCode).toBe(202);
    const id = created.json().job.id as string;

    let status = "queued";
    for (let attempt = 0; attempt < 60 && status !== "succeeded"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const current = await app.inject({ method: "GET", url: `/v1/generations/${id}`, headers: { authorization: `Bearer ${token}` } });
      status = current.json().job.status;
    }
    expect(status).toBe("succeeded");
    const download = await app.inject({ method: "GET", url: `/v1/generations/${id}/download`, headers: { authorization: `Bearer ${token}` } });
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.subarray(0, 2).toString()).toBe("PK");
  });

  it("blocks a normal user from admin overview", async () => {
    const app = await createApp();
    const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "writer@local.test", password: "writer-demo-password" } });
    const response = await app.inject({ method: "GET", url: "/v1/admin/overview", headers: { authorization: `Bearer ${login.json().token}` } });
    expect(response.statusCode).toBe(403);
  });
});

async function createApp() {
  const outputDir = await mkdtemp(join(tmpdir(), "wenhe-api-"));
  const config: AppConfig = {
    host: "127.0.0.1",
    port: 3100,
    jwtSecret: "test-secret-with-more-than-thirty-two-characters",
    corsOrigins: ["http://localhost:5173"],
    outputDir,
    mockMode: true,
    maxConcurrency: 2,
    demoUserEmail: "writer@local.test",
    demoUserPassword: "writer-demo-password",
    demoAdminEmail: "admin@local.test",
    demoAdminPassword: "admin-demo-password",
    demoAuthEnabled: true,
    wechatAppId: "",
    wechatAppSecret: "",
    redisUrl: "",
    queueName: "wenhe-generation",
  };
  const app = await buildApp(config);
  openApps.push(app);
  return app;
}
