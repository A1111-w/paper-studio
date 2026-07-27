import { describe, expect, it } from "vitest";
import { DOCUMENT_LIMITS, DocumentSpecSchema, parseDocumentSpec } from "../src/index.js";

const validSpec = {
  fileName: "测试论文",
  metadata: { title: "数字化转型研究" },
  blocks: [
    { type: "heading", level: 1, text: "绪论" },
    { type: "paragraph", runs: [{ text: "这是一段正文。" }] },
  ],
};

describe("DocumentSpecSchema", () => {
  it("applies deterministic Chinese academic defaults", () => {
    const parsed = parseDocumentSpec(validSpec);
    expect(parsed.fileName).toBe("测试论文.docx");
    expect(parsed.page.size).toBe("A4");
    expect(parsed.style.eastAsiaBodyFont).toBe("宋体");
    expect(parsed.style.latinBodyFont).toBe("Times New Roman");
    expect(parsed.footer.showPageNumber).toBe(true);
  });

  it("rejects malformed rectangular tables", () => {
    const result = DocumentSpecSchema.safeParse({
      ...validSpec,
      blocks: [{
        type: "table",
        headers: [{ text: "A" }, { text: "B" }],
        rows: [[{ text: "one" }]],
      }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects oversized aggregate content", () => {
    const chunk = "x".repeat(DOCUMENT_LIMITS.maxTextRunCharacters);
    const result = DocumentSpecSchema.safeParse({
      ...validSpec,
      blocks: Array.from({ length: 11 }, () => ({
        type: "paragraph",
        runs: [{ text: chunk }],
      })),
    });
    expect(result.success).toBe(false);
  });

  it("rejects unsafe output names and unknown keys", () => {
    expect(DocumentSpecSchema.safeParse({ ...validSpec, fileName: "../../evil.docx" }).success).toBe(false);
    expect(DocumentSpecSchema.safeParse({ ...validSpec, command: "ignored" }).success).toBe(false);
  });

  it("preserves intentional whitespace across formatted runs", () => {
    const parsed = parseDocumentSpec({
      ...validSpec,
      blocks: [{ type: "paragraph", runs: [{ text: "正文 " }, { text: "加粗", bold: true }, { text: " 继续" }] }],
    });
    const block = parsed.blocks[0];
    expect(block?.type).toBe("paragraph");
    if (block?.type === "paragraph") expect(block.runs.map((run) => run.text).join("")).toBe("正文 加粗 继续");
  });
});
