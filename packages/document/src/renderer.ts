import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  LineRuleType,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import JSZip from "jszip";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import {
  parseDocumentSpec,
  type DocumentBlock,
  type DocumentSpec,
  type DocumentSpecInput,
  type TextRun as SpecTextRun,
} from "@wenhe/contracts";

const FIXED_ARCHIVE_DATE = new Date("2000-01-01T00:00:00.000Z");
const DXA_PER_INCH = 1440;
const DXA_PER_POINT = 20;
const DEFAULT_CELL_MARGINS = Object.freeze({ top: 100, bottom: 100, left: 120, right: 120 });

type ParagraphAlignment = typeof AlignmentType[keyof typeof AlignmentType];

function mmToTwips(mm: number): number {
  return Math.round(mm / 25.4 * DXA_PER_INCH);
}

function ptToHalfPoints(points: number): number {
  return Math.round(points * 2);
}

function ptToTwips(points: number): number {
  return Math.round(points * DXA_PER_POINT);
}

function alignment(value: "left" | "center" | "right" | "justify"): ParagraphAlignment {
  return {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
  }[value];
}

function runFont(spec: DocumentSpec, override?: string): { ascii: string; highAnsi: string; eastAsia: string; cs: string } {
  const latin = override ?? spec.style.latinBodyFont;
  const eastAsia = override ?? spec.style.eastAsiaBodyFont;
  return { ascii: latin, highAnsi: latin, eastAsia, cs: latin };
}

function headingFont(spec: DocumentSpec): { ascii: string; highAnsi: string; eastAsia: string; cs: string } {
  return {
    ascii: spec.style.latinBodyFont,
    highAnsi: spec.style.latinBodyFont,
    eastAsia: spec.style.headingFont,
    cs: spec.style.latinBodyFont,
  };
}

function pageGeometry(spec: DocumentSpec): {
  width: number;
  height: number;
  contentWidth: number;
  orientation: typeof PageOrientation[keyof typeof PageOrientation];
} {
  let width = spec.page.size === "A4" ? 11_906 : 12_240;
  let height = spec.page.size === "A4" ? 16_838 : 15_840;
  const orientation = spec.page.orientation === "landscape" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT;
  if (spec.page.orientation === "landscape") [width, height] = [height, width];
  return {
    width,
    height,
    contentWidth: width - mmToTwips(spec.page.marginLeftMm) - mmToTwips(spec.page.marginRightMm),
    orientation,
  };
}

function buildStyles(spec: DocumentSpec): ConstructorParameters<typeof Document>[0]["styles"] {
  const normalLine = Math.round(spec.style.lineSpacing * 240);
  const normalIndent = ptToTwips(spec.style.bodySizePt * spec.style.firstLineIndentChars);
  return {
    default: {
      document: {
        run: {
          font: runFont(spec),
          size: ptToHalfPoints(spec.style.bodySizePt),
          color: "000000",
        },
        paragraph: {
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: normalIndent },
          spacing: {
            before: 0,
            after: ptToTwips(spec.style.paragraphAfterPt),
            line: normalLine,
            lineRule: LineRuleType.AUTO,
          },
        },
      },
    },
    paragraphStyles: [
      {
        id: "AcademicTitle",
        name: "Academic Title",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: headingFont(spec), size: ptToHalfPoints(spec.style.titleSizePt), bold: true, color: "000000" },
        paragraph: {
          alignment: AlignmentType.CENTER,
          indent: { firstLine: 0 },
          spacing: { before: 0, after: ptToTwips(18), line: 240, lineRule: LineRuleType.AUTO },
          keepNext: true,
        },
      },
      {
        id: "AcademicMetadata",
        name: "Academic Metadata",
        basedOn: "Normal",
        next: "Normal",
        run: { font: runFont(spec), size: ptToHalfPoints(10.5), color: "555555" },
        paragraph: {
          alignment: AlignmentType.CENTER,
          indent: { firstLine: 0 },
          spacing: { before: 0, after: ptToTwips(6), line: 240, lineRule: LineRuleType.AUTO },
        },
      },
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: headingFont(spec), size: ptToHalfPoints(spec.style.heading1SizePt), bold: true, color: spec.style.headingColor },
        paragraph: {
          alignment: AlignmentType.LEFT,
          indent: { firstLine: 0 },
          spacing: { before: ptToTwips(18), after: ptToTwips(8), line: normalLine, lineRule: LineRuleType.AUTO },
          keepNext: true,
          outlineLevel: 0,
        },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: headingFont(spec), size: ptToHalfPoints(spec.style.heading2SizePt), bold: true, color: spec.style.headingColor },
        paragraph: {
          alignment: AlignmentType.LEFT,
          indent: { firstLine: 0 },
          spacing: { before: ptToTwips(14), after: ptToTwips(6), line: normalLine, lineRule: LineRuleType.AUTO },
          keepNext: true,
          outlineLevel: 1,
        },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: headingFont(spec), size: ptToHalfPoints(spec.style.heading3SizePt), bold: true, color: spec.style.headingColor },
        paragraph: {
          alignment: AlignmentType.LEFT,
          indent: { firstLine: 0 },
          spacing: { before: ptToTwips(10), after: ptToTwips(4), line: normalLine, lineRule: LineRuleType.AUTO },
          keepNext: true,
          outlineLevel: 2,
        },
      },
      {
        id: "AcademicCaption",
        name: "Academic Caption",
        basedOn: "Normal",
        next: "Normal",
        run: { font: runFont(spec), size: ptToHalfPoints(10.5), color: "333333" },
        paragraph: {
          alignment: AlignmentType.CENTER,
          indent: { firstLine: 0 },
          spacing: { before: ptToTwips(8), after: ptToTwips(4), line: 240, lineRule: LineRuleType.AUTO },
          keepNext: true,
        },
      },
    ],
  };
}

function decimalText(level: number): string {
  return `${Array.from({ length: level + 1 }, (_, index) => `%${index + 1}`).join(".")}.`;
}

function buildNumbering(spec: DocumentSpec): ConstructorParameters<typeof Document>[0]["numbering"] {
  const listReferences = spec.blocks.flatMap((block, index) => {
    if (block.type !== "list") return [];
    return [{
      reference: `academic-list-${index}`,
      levels: Array.from({ length: 4 }, (_, level) => ({
        level,
        format: block.style === "bullet" ? LevelFormat.BULLET : LevelFormat.DECIMAL,
        text: block.style === "bullet" ? ["•", "◦", "▪", "•"][level]! : decimalText(level),
        alignment: AlignmentType.LEFT,
        style: {
          paragraph: {
            indent: { left: 720 + level * 360, hanging: 360 },
            spacing: { before: 0, after: ptToTwips(4), line: Math.round(spec.style.lineSpacing * 240), lineRule: LineRuleType.AUTO },
          },
          run: { font: runFont(spec), size: ptToHalfPoints(spec.style.bodySizePt) },
        },
      })),
    }];
  });
  return {
    config: [
      {
        reference: "academic-headings",
        levels: [0, 1, 2].map((level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: decimalText(level),
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: { indent: { left: 0, hanging: 0 } },
            run: { font: headingFont(spec), bold: true },
          },
        })),
      },
      ...listReferences,
    ],
  };
}

function textRun(spec: DocumentSpec, run: SpecTextRun): TextRun {
  return new TextRun({
    text: run.text,
    bold: run.bold,
    italics: run.italic,
    underline: run.underline ? {} : undefined,
    superScript: run.superscript,
    subScript: run.subscript,
    font: runFont(spec, run.font),
    size: run.sizePt === undefined ? ptToHalfPoints(spec.style.bodySizePt) : ptToHalfPoints(run.sizePt),
    color: run.color,
  });
}

function titleBlock(spec: DocumentSpec): Paragraph[] {
  const paragraphs = [
    new Paragraph({ style: "AcademicTitle", children: [new TextRun({ text: spec.metadata.title, font: headingFont(spec), bold: true })] }),
  ];
  if (spec.metadata.subtitle) {
    paragraphs.push(new Paragraph({
      style: "AcademicMetadata",
      spacing: { after: ptToTwips(10) },
      children: [new TextRun({ text: spec.metadata.subtitle, font: runFont(spec), size: ptToHalfPoints(12), color: "333333" })],
    }));
  }
  const metadata = [spec.metadata.author, spec.metadata.institution, spec.metadata.department, spec.metadata.date]
    .filter((value): value is string => Boolean(value));
  if (metadata.length > 0) {
    paragraphs.push(new Paragraph({ style: "AcademicMetadata", children: [new TextRun({ text: metadata.join("  |  "), font: runFont(spec) })] }));
  }
  if (spec.metadata.abstract) {
    paragraphs.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      numbering: undefined,
      children: [new TextRun({ text: spec.metadata.language === "zh-CN" ? "摘要" : "Abstract", font: headingFont(spec), bold: true })],
    }));
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { firstLine: ptToTwips(spec.style.bodySizePt * spec.style.firstLineIndentChars) },
      children: [new TextRun({ text: spec.metadata.abstract, font: runFont(spec), size: ptToHalfPoints(spec.style.bodySizePt) })],
    }));
  }
  if (spec.metadata.keywords.length > 0) {
    paragraphs.push(new Paragraph({
      indent: { firstLine: 0 },
      spacing: { after: ptToTwips(12) },
      children: [
        new TextRun({ text: spec.metadata.language === "zh-CN" ? "关键词：" : "Keywords: ", font: headingFont(spec), bold: true }),
        new TextRun({ text: spec.metadata.keywords.join(spec.metadata.language === "zh-CN" ? "；" : "; "), font: runFont(spec) }),
      ],
    }));
  }
  return paragraphs;
}

function headingLevel(level: 1 | 2 | 3): typeof HeadingLevel[keyof typeof HeadingLevel] {
  return [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][level - 1]!;
}

function tableColumnWidths(block: Extract<DocumentBlock, { type: "table" }>, contentWidth: number): number[] {
  const weights = block.columnWidths ?? block.headers.map(() => 1 / block.headers.length);
  const widths = weights.map((weight) => Math.floor(weight * contentWidth));
  widths[widths.length - 1] = contentWidth - widths.slice(0, -1).reduce((sum, width) => sum + width, 0);
  return widths;
}

function tableCell(spec: DocumentSpec, cell: { text: string; alignment?: "left" | "center" | "right"; bold?: boolean }, width: number, header: boolean): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: header ? { type: ShadingType.CLEAR, fill: "F2F4F7", color: "auto" } : undefined,
    margins: DEFAULT_CELL_MARGINS,
    children: [new Paragraph({
      alignment: alignment(cell.alignment ?? (header ? "center" : "left")),
      indent: { firstLine: 0 },
      spacing: { before: 0, after: 0, line: 280, lineRule: LineRuleType.AUTO },
      children: [new TextRun({
        text: cell.text,
        bold: header || cell.bold,
        font: runFont(spec),
        size: ptToHalfPoints(Math.max(9, spec.style.bodySizePt - 1)),
      })],
    })],
  });
}

function renderTable(spec: DocumentSpec, block: Extract<DocumentBlock, { type: "table" }>, contentWidth: number): (Paragraph | Table)[] {
  const widths = tableColumnWidths(block, contentWidth);
  const borders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "B7B7B7" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "B7B7B7" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "B7B7B7" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "B7B7B7" },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  };
  const rows = [
    new TableRow({
      tableHeader: block.repeatHeader,
      children: block.headers.map((cell, index) => tableCell(spec, cell, widths[index]!, true)),
    }),
    ...block.rows.map((row) => new TableRow({
      children: row.map((cell, index) => tableCell(spec, cell, widths[index]!, false)),
    })),
  ];
  const table = new Table({
    width: { size: contentWidth, type: WidthType.DXA },
    indent: { size: DEFAULT_CELL_MARGINS.left, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders,
    margins: DEFAULT_CELL_MARGINS,
    rows,
  });
  return [
    ...(block.caption ? [new Paragraph({ style: "AcademicCaption", children: [new TextRun({ text: block.caption, font: runFont(spec) })] })] : []),
    table,
    new Paragraph({ spacing: { before: 0, after: ptToTwips(4) }, children: [] }),
  ];
}

function renderBlock(spec: DocumentSpec, block: DocumentBlock, blockIndex: number, contentWidth: number): (Paragraph | Table)[] {
  if (block.type === "paragraph") {
    return [new Paragraph({
      alignment: alignment(block.alignment),
      indent: { firstLine: ptToTwips(spec.style.bodySizePt * block.firstLineIndentChars) },
      spacing: {
        before: block.spaceBeforePt === undefined ? 0 : ptToTwips(block.spaceBeforePt),
        after: block.spaceAfterPt === undefined ? ptToTwips(spec.style.paragraphAfterPt) : ptToTwips(block.spaceAfterPt),
        line: Math.round((block.lineSpacing ?? spec.style.lineSpacing) * 240),
        lineRule: LineRuleType.AUTO,
      },
      keepNext: block.keepWithNext,
      children: block.runs.map((run) => textRun(spec, run)),
    })];
  }
  if (block.type === "heading") {
    return [new Paragraph({
      heading: headingLevel(block.level),
      numbering: block.numbered ? { reference: "academic-headings", level: block.level - 1 } : undefined,
      pageBreakBefore: block.pageBreakBefore,
      children: [new TextRun({ text: block.text, font: headingFont(spec), bold: true })],
    })];
  }
  if (block.type === "list") {
    return block.items.map((item) => new Paragraph({
      numbering: { reference: `academic-list-${blockIndex}`, level: item.level },
      indent: { firstLine: 0 },
      children: [new TextRun({ text: item.text, font: runFont(spec), size: ptToHalfPoints(spec.style.bodySizePt) })],
    }));
  }
  if (block.type === "table") return renderTable(spec, block, contentWidth);
  return [new Paragraph({ children: [new PageBreak()] })];
}

function runningHeader(spec: DocumentSpec): Header {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      indent: { firstLine: 0 },
      spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
      children: spec.header.text
        ? [new TextRun({ text: spec.header.text, font: runFont(spec), size: ptToHalfPoints(9), color: "666666" })]
        : [],
    })],
  });
}

function runningFooter(spec: DocumentSpec): Footer {
  const children: TextRun[] = [];
  if (spec.footer.text) children.push(new TextRun({ text: spec.footer.text, font: runFont(spec), size: ptToHalfPoints(9), color: "666666" }));
  if (spec.footer.text && spec.footer.showPageNumber) children.push(new TextRun({ text: "  |  ", font: runFont(spec), size: ptToHalfPoints(9), color: "999999" }));
  if (spec.footer.showPageNumber) children.push(new TextRun({ children: [PageNumber.CURRENT], font: runFont(spec), size: ptToHalfPoints(9), color: "666666" }));
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      indent: { firstLine: 0 },
      spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
      children,
    })],
  });
}

function buildDocument(spec: DocumentSpec): Document {
  const geometry = pageGeometry(spec);
  const header = runningHeader(spec);
  const footer = runningFooter(spec);
  const emptyHeader = new Header({ children: [new Paragraph({ children: [] })] });
  const children = [
    ...titleBlock(spec),
    ...spec.blocks.flatMap((block, index) => renderBlock(spec, block, index, geometry.contentWidth)),
  ];
  return new Document({
    creator: "Wenhe Document Service",
    lastModifiedBy: "Wenhe Document Service",
    title: spec.metadata.title,
    subject: "Academic article",
    description: "Generated from a validated DocumentSpec",
    keywords: spec.metadata.keywords.join(", "),
    revision: 1,
    styles: buildStyles(spec),
    numbering: buildNumbering(spec),
    sections: [{
      properties: {
        titlePage: !spec.header.showOnFirstPage,
        page: {
          size: { width: geometry.width, height: geometry.height, orientation: geometry.orientation },
          margin: {
            top: mmToTwips(spec.page.marginTopMm),
            right: mmToTwips(spec.page.marginRightMm),
            bottom: mmToTwips(spec.page.marginBottomMm),
            left: mmToTwips(spec.page.marginLeftMm),
            header: mmToTwips(spec.page.headerDistanceMm),
            footer: mmToTwips(spec.page.footerDistanceMm),
            gutter: 0,
          },
          pageNumbers: { start: 1 },
        },
      },
      headers: { default: header, first: spec.header.showOnFirstPage ? header : emptyHeader },
      footers: { default: footer, first: footer },
      children,
    }],
  });
}

async function deterministicArchive(buffer: Uint8Array): Promise<Uint8Array> {
  const source = await JSZip.loadAsync(buffer, { checkCRC32: true });
  const target = new JSZip();
  const files = Object.values(source.files).filter((entry) => !entry.dir).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of files) {
    let data = await entry.async("uint8array");
    if (entry.name === "docProps/core.xml") {
      const parser = new XMLParser({ ignoreAttributes: false, processEntities: false, parseTagValue: false });
      const builder = new XMLBuilder({ ignoreAttributes: false, suppressEmptyNode: true });
      const coreXml = parser.parse(new TextDecoder().decode(data)) as Record<string, Record<string, unknown>>;
      delete coreXml["?xml"];
      const properties = coreXml["cp:coreProperties"];
      if (properties) {
        for (const field of ["dcterms:created", "dcterms:modified"]) {
          const current = properties[field];
          if (current && typeof current === "object") {
            (current as Record<string, unknown>)["#text"] = FIXED_ARCHIVE_DATE.toISOString();
          } else {
            properties[field] = FIXED_ARCHIVE_DATE.toISOString();
          }
        }
        data = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${builder.build(coreXml)}`);
      }
    }
    target.file(entry.name, data, {
      binary: true,
      date: FIXED_ARCHIVE_DATE,
      createFolders: false,
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });
  }
  return target.generateAsync({
    type: "uint8array",
    platform: "DOS",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
}

export async function renderDocument(input: DocumentSpecInput | unknown): Promise<Uint8Array> {
  const spec = parseDocumentSpec(input);
  const packed = await Packer.toBuffer(buildDocument(spec));
  return deterministicArchive(packed);
}

export async function renderDocumentToFile(
  input: DocumentSpecInput | unknown,
  outputDirectory: string,
): Promise<{ path: string; bytes: number }> {
  const spec = parseDocumentSpec(input);
  const root = resolve(outputDirectory);
  const output = resolve(root, spec.fileName);
  if (dirname(output) !== root) throw new Error("Resolved output path escapes the output directory");
  await mkdir(root, { recursive: true });
  const data = await renderDocument(spec);
  const temporary = `${output}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, data, { flag: "wx", mode: 0o600 });
  try {
    await rename(temporary, output);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return { path: output, bytes: data.byteLength };
}
