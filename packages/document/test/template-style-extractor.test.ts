import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractTemplateStyles, renderDocument } from "../src/index.js";

describe("extractTemplateStyles", () => {
  it("extracts styles and page geometry from a generated DOCX", async () => {
    const docx = await renderDocument({
      fileName: "template.docx",
      metadata: { title: "模板" },
      blocks: [{ type: "paragraph", runs: [{ text: "正文" }] }],
    });
    const profile = await extractTemplateStyles(docx);
    expect(profile.archive.entryCount).toBeGreaterThan(5);
    expect(profile.defaults.run.eastAsiaFont).toBe("宋体");
    expect(profile.paragraphStyles.some((style) => style.styleId === "Heading1")).toBe(true);
    expect(profile.page?.widthTwips).toBe(11_906);
  });

  it("rejects DTD/entity declarations before parsing", async () => {
    const zip = new JSZip();
    zip.file("word/styles.xml", "<!DOCTYPE styles [<!ENTITY x 'boom'>]><w:styles xmlns:w='x'/>");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(extractTemplateStyles(bytes)).rejects.toThrow(/forbidden DTD or entity/i);
  });

  it("rejects suspicious compression ratios", async () => {
    const zip = new JSZip();
    zip.file("word/styles.xml", `<w:styles xmlns:w="x"><w:docDefaults>${"A".repeat(100_000)}</w:docDefaults></w:styles>`);
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 9 } });
    await expect(extractTemplateStyles(bytes, { maxCompressionRatio: 10 })).rejects.toThrow(/compression ratio/i);
  });

  it("rejects compressed input over the configured limit", async () => {
    await expect(extractTemplateStyles(new Uint8Array(128), { maxCompressedBytes: 64 })).rejects.toThrow(/compressed size/i);
  });

  it("caps all declared styles, not only paragraph styles", async () => {
    const zip = new JSZip();
    zip.file("word/styles.xml", "<w:styles xmlns:w='x'><w:style w:type='character' w:styleId='a'/><w:style w:type='table' w:styleId='b'/></w:styles>");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(extractTemplateStyles(bytes, { maxStyles: 1 })).rejects.toThrow(/too many styles/i);
  });
});
