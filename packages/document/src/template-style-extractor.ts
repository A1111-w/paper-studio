import { stat, readFile } from "node:fs/promises";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export const DEFAULT_TEMPLATE_LIMITS = Object.freeze({
  maxCompressedBytes: 20 * 1024 * 1024,
  maxEntries: 512,
  maxEntryUncompressedBytes: 12 * 1024 * 1024,
  maxTotalUncompressedBytes: 80 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxStyles: 512,
});

export interface TemplateExtractionLimits {
  maxCompressedBytes: number;
  maxEntries: number;
  maxEntryUncompressedBytes: number;
  maxTotalUncompressedBytes: number;
  maxCompressionRatio: number;
  maxStyles: number;
}

export interface ExtractedRunStyle {
  asciiFont?: string;
  eastAsiaFont?: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

export interface ExtractedParagraphStyle {
  styleId: string;
  name: string;
  basedOn?: string;
  next?: string;
  quickFormat: boolean;
  run: ExtractedRunStyle;
  paragraph: {
    alignment?: string;
    beforePt?: number;
    afterPt?: number;
    lineTwips?: number;
    outlineLevel?: number;
  };
}

export interface TemplateStyleProfile {
  archive: {
    entryCount: number;
    compressedBytes: number;
    declaredUncompressedBytes: number;
  };
  defaults: {
    run: ExtractedRunStyle;
    paragraph: ExtractedParagraphStyle["paragraph"];
  };
  paragraphStyles: ExtractedParagraphStyle[];
  page?: {
    widthTwips?: number;
    heightTwips?: number;
    orientation?: string;
    marginTopTwips?: number;
    marginRightTwips?: number;
    marginBottomTwips?: number;
    marginLeftTwips?: number;
    headerTwips?: number;
    footerTwips?: number;
  };
}

interface ZipDataMetadata {
  compressedSize?: number;
  uncompressedSize?: number;
}

function toPositiveInt(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function attr(node: unknown, name: string): string | undefined {
  const value = asRecord(node)[`@_${name}`];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function child(node: unknown, key: string): unknown {
  return asRecord(node)[key];
}

function onOff(node: unknown): boolean | undefined {
  if (node === undefined) return undefined;
  const value = attr(node, "val");
  return value === undefined ? true : !["0", "false", "off", "no"].includes(value.toLowerCase());
}

function halfPoints(node: unknown): number | undefined {
  const value = toPositiveInt(attr(node, "val"));
  return value === undefined ? undefined : value / 2;
}

function twipsToPoints(value: unknown): number | undefined {
  const twips = toPositiveInt(value);
  return twips === undefined ? undefined : twips / 20;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function extractRun(runProperties: unknown): ExtractedRunStyle {
  const rPr = asRecord(runProperties);
  const fonts = child(rPr, "rFonts");
  return compact({
    asciiFont: attr(fonts, "ascii") ?? attr(fonts, "hAnsi"),
    eastAsiaFont: attr(fonts, "eastAsia"),
    sizePt: halfPoints(child(rPr, "sz")) ?? halfPoints(child(rPr, "szCs")),
    bold: onOff(child(rPr, "b")),
    italic: onOff(child(rPr, "i")),
    color: attr(child(rPr, "color"), "val"),
  });
}

function extractParagraph(paragraphProperties: unknown): ExtractedParagraphStyle["paragraph"] {
  const pPr = asRecord(paragraphProperties);
  const spacing = child(pPr, "spacing");
  return compact({
    alignment: attr(child(pPr, "jc"), "val"),
    beforePt: twipsToPoints(attr(spacing, "before")),
    afterPt: twipsToPoints(attr(spacing, "after")),
    lineTwips: toPositiveInt(attr(spacing, "line")),
    outlineLevel: toPositiveInt(attr(child(pPr, "outlineLvl"), "val")),
  });
}

function parseXml(xml: string, entryName: string): unknown {
  if (xml.includes("<!DOCTYPE") || xml.includes("<!ENTITY")) {
    throw new Error(`${entryName} contains a forbidden DTD or entity declaration`);
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: false,
    htmlEntities: false,
    allowBooleanAttributes: false,
  });
  return parser.parse(xml);
}

function resolveLimits(overrides: Partial<TemplateExtractionLimits>): TemplateExtractionLimits {
  const resolved = { ...DEFAULT_TEMPLATE_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid extraction limit: ${name}`);
  }
  return resolved;
}

function validateEntryName(name: string): void {
  const normalized = name.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.split("/").includes("..") || name.includes("\u0000")) {
    throw new Error(`Unsafe ZIP entry path: ${name}`);
  }
}

function getEntryMetadata(entry: JSZip.JSZipObject): Required<ZipDataMetadata> {
  // JSZip has no public pre-inflation size API; keep its version pinned while using central-directory metadata.
  const data = (entry as unknown as { _data?: ZipDataMetadata })._data;
  const compressedSize = toPositiveInt(data?.compressedSize);
  const uncompressedSize = toPositiveInt(data?.uncompressedSize);
  if (compressedSize === undefined || uncompressedSize === undefined) {
    throw new Error(`DOCX entry size metadata is unavailable: ${entry.name}`);
  }
  return { compressedSize, uncompressedSize };
}

export async function extractTemplateStyles(
  input: Uint8Array | ArrayBuffer,
  overrides: Partial<TemplateExtractionLimits> = {},
): Promise<TemplateStyleProfile> {
  const limits = resolveLimits(overrides);
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength === 0 || bytes.byteLength > limits.maxCompressedBytes) {
    throw new Error(`DOCX compressed size must be between 1 and ${limits.maxCompressedBytes} bytes`);
  }

  // CRC verification would inflate every entry before the declared-size guards run.
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
  const entries = Object.values(zip.files);
  if (entries.length === 0 || entries.length > limits.maxEntries) {
    throw new Error(`DOCX entry count exceeds the allowed range (1-${limits.maxEntries})`);
  }

  let totalUncompressed = 0;
  for (const entry of entries) {
    validateEntryName(entry.name);
    const unsafeName = (entry as unknown as { unsafeOriginalName?: string }).unsafeOriginalName;
    if (unsafeName) validateEntryName(unsafeName);
    if (entry.dir) continue;
    const { compressedSize, uncompressedSize } = getEntryMetadata(entry);
    if (uncompressedSize > limits.maxEntryUncompressedBytes) {
      throw new Error(`DOCX entry is too large after decompression: ${entry.name}`);
    }
    const ratio = uncompressedSize === 0 ? 1 : compressedSize === 0 ? Infinity : uncompressedSize / compressedSize;
    if (ratio > limits.maxCompressionRatio) {
      throw new Error(`DOCX entry has a suspicious compression ratio: ${entry.name}`);
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limits.maxTotalUncompressedBytes) {
      throw new Error("DOCX total declared uncompressed size is too large");
    }
  }

  const stylesEntry = zip.file("word/styles.xml");
  if (!stylesEntry) throw new Error("The DOCX does not contain word/styles.xml");
  const stylesRoot = asRecord(parseXml(await stylesEntry.async("string"), "word/styles.xml"));
  const styles = asRecord(stylesRoot.styles);
  const documentDefaults = asRecord(styles.docDefaults);
  const defaultRunProperties = child(child(documentDefaults, "rPrDefault"), "rPr");
  const defaultParagraphProperties = child(child(documentDefaults, "pPrDefault"), "pPr");

  const paragraphStyles: ExtractedParagraphStyle[] = [];
  const rawStyles = asArray(styles.style);
  if (rawStyles.length > limits.maxStyles) throw new Error("DOCX contains too many styles");
  for (const rawStyle of rawStyles) {
    if (attr(rawStyle, "type") !== "paragraph") continue;
    const styleId = attr(rawStyle, "styleId");
    if (!styleId) continue;
    const styleRecord = asRecord(rawStyle);
    paragraphStyles.push(compact({
      styleId,
      name: attr(child(styleRecord, "name"), "val") ?? styleId,
      basedOn: attr(child(styleRecord, "basedOn"), "val"),
      next: attr(child(styleRecord, "next"), "val"),
      quickFormat: child(styleRecord, "qFormat") !== undefined,
      run: extractRun(styleRecord.rPr),
      paragraph: extractParagraph(styleRecord.pPr),
    }));
  }

  let page: TemplateStyleProfile["page"];
  const documentEntry = zip.file("word/document.xml");
  if (documentEntry) {
    const root = asRecord(parseXml(await documentEntry.async("string"), "word/document.xml"));
    const body = asRecord(child(root.document, "body"));
    const section = asRecord(asArray(body.sectPr).at(-1));
    const size = child(section, "pgSz");
    const margin = child(section, "pgMar");
    if (Object.keys(section).length > 0) {
      page = compact({
        widthTwips: toPositiveInt(attr(size, "w")),
        heightTwips: toPositiveInt(attr(size, "h")),
        orientation: attr(size, "orient"),
        marginTopTwips: toPositiveInt(attr(margin, "top")),
        marginRightTwips: toPositiveInt(attr(margin, "right")),
        marginBottomTwips: toPositiveInt(attr(margin, "bottom")),
        marginLeftTwips: toPositiveInt(attr(margin, "left")),
        headerTwips: toPositiveInt(attr(margin, "header")),
        footerTwips: toPositiveInt(attr(margin, "footer")),
      });
    }
  }

  const profile: TemplateStyleProfile = {
    archive: {
      entryCount: entries.length,
      compressedBytes: bytes.byteLength,
      declaredUncompressedBytes: totalUncompressed,
    },
    defaults: {
      run: extractRun(defaultRunProperties),
      paragraph: extractParagraph(defaultParagraphProperties),
    },
    paragraphStyles,
  };
  if (page) profile.page = page;
  return profile;
}

export async function extractTemplateStylesFromFile(
  path: string,
  overrides: Partial<TemplateExtractionLimits> = {},
): Promise<TemplateStyleProfile> {
  const limits = resolveLimits(overrides);
  const info = await stat(path);
  if (!info.isFile()) throw new Error("Template path must point to a regular file");
  if (info.size === 0 || info.size > limits.maxCompressedBytes) {
    throw new Error(`DOCX compressed size must be between 1 and ${limits.maxCompressedBytes} bytes`);
  }
  return extractTemplateStyles(await readFile(path), limits);
}
