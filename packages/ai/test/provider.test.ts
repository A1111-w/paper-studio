import { describe, expect, it } from "vitest";
import { MockDocumentProvider } from "../src/provider.js";
import { validateProviderConfig } from "../src/registry.js";

describe("provider security", () => {
  it("rejects unapproved relay hosts", () => {
    expect(() => validateProviderConfig({
      id: "relay",
      label: "Relay",
      baseUrl: "https://attacker.example/v1",
      model: "model",
      apiKey: "secret",
      allowedHosts: ["relay.example"],
    })).toThrow(/not in RELAY_ALLOWED_HOSTS/u);
  });

  it("rejects plaintext provider URLs", () => {
    expect(() => validateProviderConfig({
      id: "relay",
      label: "Relay",
      baseUrl: "http://relay.example/v1",
      model: "model",
      apiKey: "secret",
      allowedHosts: ["relay.example"],
    })).toThrow(/HTTPS/u);
  });
});
describe("mock document provider", () => {
  it("returns a validated semantic document", async () => {
    const result = await new MockDocumentProvider().generate({
      topic: "人工智能辅助高校写作教学研究",
      requirements: "生成结构完整的中文论文演示文档",
      outline: ["研究背景", "教学设计", "风险治理", "结论"],
    });
    expect(result.document.fileName).toMatch(/\.docx$/u);
    expect(result.document.blocks.filter((block) => block.type === "heading")).toHaveLength(4);
  });
});
