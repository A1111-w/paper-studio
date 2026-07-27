import { z } from "zod";

export const DOCUMENT_LIMITS = Object.freeze({
  maxBlocks: 500,
  maxTotalCharacters: 200_000,
  maxTextRunCharacters: 20_000,
  maxRunsPerParagraph: 100,
  maxListItems: 300,
  maxTableRows: 200,
  maxTableColumns: 20,
  maxTableCells: 2_000,
  maxKeywords: 20,
  maxFileNameCharacters: 120,
});

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const preservedText = (max: number) => z.string().min(1).max(max).refine(
  (value) => value.trim().length > 0,
  "Text must contain at least one non-whitespace character",
);
const color = z.string().regex(/^[0-9A-Fa-f]{6}$/, "Expected a six-digit RGB color");
const fontName = boundedText(80).refine(
  (value) => !/[<>\u0000-\u001f]/u.test(value),
  "Font name contains unsafe characters",
);

export const TextRunSchema = z.object({
  text: preservedText(DOCUMENT_LIMITS.maxTextRunCharacters),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  superscript: z.boolean().optional(),
  subscript: z.boolean().optional(),
  font: fontName.optional(),
  sizePt: z.number().min(8).max(36).optional(),
  color: color.optional(),
}).strict().refine(
  (run) => !(run.superscript && run.subscript),
  "A run cannot be both superscript and subscript",
);

export const ParagraphBlockSchema = z.object({
  type: z.literal("paragraph"),
  runs: z.array(TextRunSchema).min(1).max(DOCUMENT_LIMITS.maxRunsPerParagraph),
  alignment: z.enum(["left", "center", "right", "justify"]).default("justify"),
  firstLineIndentChars: z.number().min(0).max(4).default(2),
  spaceBeforePt: z.number().min(0).max(72).optional(),
  spaceAfterPt: z.number().min(0).max(72).optional(),
  lineSpacing: z.number().min(1).max(3).optional(),
  keepWithNext: z.boolean().optional(),
}).strict();

export const HeadingBlockSchema = z.object({
  type: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: boundedText(500),
  numbered: z.boolean().default(true),
  pageBreakBefore: z.boolean().optional(),
}).strict();

const ListItemSchema = z.object({
  text: boundedText(5_000),
  level: z.number().int().min(0).max(3).default(0),
}).strict();

export const ListBlockSchema = z.object({
  type: z.literal("list"),
  style: z.enum(["bullet", "decimal"]),
  items: z.array(ListItemSchema).min(1).max(DOCUMENT_LIMITS.maxListItems),
}).strict();

const TableCellSchema = z.object({
  text: z.string().max(10_000),
  alignment: z.enum(["left", "center", "right"]).optional(),
  bold: z.boolean().optional(),
}).strict();

export const TableBlockSchema = z.object({
  type: z.literal("table"),
  caption: boundedText(500).optional(),
  headers: z.array(TableCellSchema).min(1).max(DOCUMENT_LIMITS.maxTableColumns),
  rows: z.array(z.array(TableCellSchema).max(DOCUMENT_LIMITS.maxTableColumns))
    .max(DOCUMENT_LIMITS.maxTableRows),
  columnWidths: z.array(z.number().positive().max(1)).optional(),
  repeatHeader: z.boolean().default(true),
}).strict().superRefine((table, ctx) => {
  const columns = table.headers.length;
  if (table.rows.some((row) => row.length !== columns)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Every table row must match the header column count" });
  }
  if (table.rows.length * columns > DOCUMENT_LIMITS.maxTableCells) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `A table may contain at most ${DOCUMENT_LIMITS.maxTableCells} body cells` });
  }
  if (table.columnWidths) {
    if (table.columnWidths.length !== columns) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "columnWidths must match the header column count" });
    }
    const sum = table.columnWidths.reduce((total, width) => total + width, 0);
    if (Math.abs(sum - 1) > 0.001) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "columnWidths must sum to 1" });
    }
  }
});

export const PageBreakBlockSchema = z.object({ type: z.literal("pageBreak") }).strict();

export const DocumentBlockSchema = z.union([
  ParagraphBlockSchema,
  HeadingBlockSchema,
  ListBlockSchema,
  TableBlockSchema,
  PageBreakBlockSchema,
]);

export const AcademicStyleSchema = z.object({
  eastAsiaBodyFont: fontName.default("宋体"),
  latinBodyFont: fontName.default("Times New Roman"),
  headingFont: fontName.default("黑体"),
  bodySizePt: z.number().min(9).max(18).default(12),
  titleSizePt: z.number().min(16).max(36).default(22),
  heading1SizePt: z.number().min(12).max(24).default(16),
  heading2SizePt: z.number().min(11).max(22).default(15),
  heading3SizePt: z.number().min(10).max(20).default(14),
  lineSpacing: z.number().min(1).max(3).default(1.5),
  paragraphAfterPt: z.number().min(0).max(36).default(0),
  firstLineIndentChars: z.number().min(0).max(4).default(2),
  headingColor: color.default("000000"),
}).strict().default({});

export const PageSetupSchema = z.object({
  size: z.enum(["A4", "Letter"]).default("A4"),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  marginTopMm: z.number().min(15).max(50).default(25.4),
  marginRightMm: z.number().min(15).max(50).default(25.4),
  marginBottomMm: z.number().min(15).max(50).default(25.4),
  marginLeftMm: z.number().min(15).max(50).default(30),
  headerDistanceMm: z.number().min(5).max(30).default(12.5),
  footerDistanceMm: z.number().min(5).max(30).default(12.5),
}).strict().default({});

export const DocumentSpecSchema = z.object({
  version: z.literal("1.0").default("1.0"),
  fileName: boundedText(DOCUMENT_LIMITS.maxFileNameCharacters)
    .regex(/^[^<>:"/\\|?*]+$/, "fileName contains characters not allowed by Windows")
    .transform((name) => name.toLowerCase().endsWith(".docx") ? name : `${name}.docx`),
  metadata: z.object({
    title: boundedText(300),
    subtitle: boundedText(500).optional(),
    author: boundedText(120).optional(),
    institution: boundedText(200).optional(),
    department: boundedText(200).optional(),
    date: boundedText(80).optional(),
    abstract: boundedText(10_000).optional(),
    keywords: z.array(boundedText(80)).max(DOCUMENT_LIMITS.maxKeywords).default([]),
    language: z.enum(["zh-CN", "en-US"]).default("zh-CN"),
  }).strict(),
  page: PageSetupSchema,
  style: AcademicStyleSchema,
  header: z.object({
    text: z.string().max(300).default(""),
    showOnFirstPage: z.boolean().default(false),
  }).strict().default({}),
  footer: z.object({
    text: z.string().max(300).default(""),
    showPageNumber: z.boolean().default(true),
  }).strict().default({}),
  blocks: z.array(DocumentBlockSchema).min(1).max(DOCUMENT_LIMITS.maxBlocks),
}).strict().superRefine((document, ctx) => {
  let total = document.metadata.title.length
    + (document.metadata.subtitle?.length ?? 0)
    + (document.metadata.author?.length ?? 0)
    + (document.metadata.institution?.length ?? 0)
    + (document.metadata.department?.length ?? 0)
    + (document.metadata.date?.length ?? 0)
    + (document.metadata.abstract?.length ?? 0)
    + document.metadata.keywords.reduce((sum, keyword) => sum + keyword.length, 0)
    + document.header.text.length
    + document.footer.text.length;
  for (const block of document.blocks) {
    if (block.type === "paragraph") total += block.runs.reduce((sum, run) => sum + run.text.length, 0);
    if (block.type === "heading") total += block.text.length;
    if (block.type === "list") total += block.items.reduce((sum, item) => sum + item.text.length, 0);
    if (block.type === "table") {
      total += block.caption?.length ?? 0;
      total += block.headers.reduce((sum, cell) => sum + cell.text.length, 0);
      total += block.rows.flat().reduce((sum, cell) => sum + cell.text.length, 0);
    }
  }
  if (total > DOCUMENT_LIMITS.maxTotalCharacters) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["blocks"],
      message: `Document text exceeds ${DOCUMENT_LIMITS.maxTotalCharacters} characters`,
    });
  }
});

export type TextRun = z.infer<typeof TextRunSchema>;
export type DocumentBlock = z.infer<typeof DocumentBlockSchema>;
export type DocumentSpec = z.infer<typeof DocumentSpecSchema>;
export type DocumentSpecInput = z.input<typeof DocumentSpecSchema>;

export const generateDocumentTool = Object.freeze({
  name: "generate_academic_docx",
  description: "Render a validated academic article specification into a deterministic DOCX file. Use semantic heading, paragraph, real-list, table, and page-break blocks; do not embed OOXML or HTML.",
  inputSchema: DocumentSpecSchema,
  limits: DOCUMENT_LIMITS,
});

export function parseDocumentSpec(input: unknown): DocumentSpec {
  return DocumentSpecSchema.parse(input);
}
