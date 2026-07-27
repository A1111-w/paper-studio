import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { renderDocument } from "../src/index.js";

const sample = {
  fileName: "academic-sample.docx",
  metadata: {
    title: "数字治理中的协同机制研究",
    author: "测试作者",
    institution: "示例大学",
    abstract: "本文以数字治理为研究对象，讨论多主体协同机制。",
    keywords: ["数字治理", "协同机制"],
  },
  header: { text: "示例大学本科毕业论文" },
  footer: { text: "数字治理研究", showPageNumber: true },
  blocks: [
    { type: "heading", level: 1, text: "研究背景", numbered: true },
    { type: "paragraph", runs: [{ text: "数字技术持续改变公共治理的组织方式。" }] },
    { type: "list", style: "decimal", items: [{ text: "提出研究问题", level: 0 }, { text: "构建分析框架", level: 0 }] },
    {
      type: "table",
      caption: "表1 分析维度",
      headers: [{ text: "维度" }, { text: "说明" }],
      rows: [[{ text: "主体" }, { text: "政府、企业与社会组织" }]],
      columnWidths: [0.25, 0.75],
    },
    { type: "pageBreak" },
    { type: "heading", level: 2, text: "研究设计", numbered: true },
  ],
} as const;

describe("renderDocument", () => {
  it("creates a byte-stable DOCX with academic OOXML structures", async () => {
    const first = await renderDocument(sample);
    const second = await renderDocument(sample);
    expect(first).toEqual(second);
    expect(first.byteLength).toBeGreaterThan(5_000);

    const zip = await JSZip.loadAsync(first);
    const documentXml = await zip.file("word/document.xml")!.async("string");
    const stylesXml = await zip.file("word/styles.xml")!.async("string");
    const numberingXml = await zip.file("word/numbering.xml")!.async("string");
    const footerXml = await zip.file("word/footer1.xml")!.async("string");
    const coreXml = await zip.file("docProps/core.xml")!.async("string");

    expect(documentXml).toContain("w:tblLayout");
    expect(documentXml).toContain("w:tblGrid");
    expect(documentXml).toContain("w:tblHeader");
    expect(documentXml).toContain("w:br w:type=\"page\"");
    expect(stylesXml).toContain("w:styleId=\"Heading1\"");
    expect(stylesXml).toContain("w:eastAsia=\"宋体\"");
    expect(numberingXml).toContain("w:abstractNum");
    expect(numberingXml).toContain("w:lvlText");
    expect(footerXml).toContain("PAGE");
    expect(coreXml.match(/<\?xml/g)).toHaveLength(1);
    expect(coreXml).toContain("2000-01-01T00:00:00.000Z");
  });
});
