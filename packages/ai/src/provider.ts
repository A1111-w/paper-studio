import {
  DocumentSpecSchema,
  type DocumentSpec,
  type DocumentSpecInput,
} from "@wenhe/contracts";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ProviderConfig } from "./registry.js";

export interface ArticleRequest {
  topic: string;
  requirements: string;
  author?: string;
  institution?: string;
  outline?: string[];
  styleHints?: Partial<DocumentSpecInput["style"]>;
  pageHints?: Partial<DocumentSpecInput["page"]>;
  targetCharacters?: number;
}
export interface GenerationResult {
  document: DocumentSpec;
  providerId: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
}

export interface DocumentProvider {
  generate(request: ArticleRequest): Promise<GenerationResult>;
}

export class OpenAICompatibleDocumentProvider implements DocumentProvider {
  constructor(private readonly config: ProviderConfig) {}

  async generate(request: ArticleRequest): Promise<GenerationResult> {
    validateArticleRequest(request);
    const response = await withRetry(() => this.requestCompletion(request), 2);
    const choice = response.choices?.[0]?.message;
    const toolCall = choice?.tool_calls?.find((call) => call.function?.name === "generate_academic_docx");
    const rawArguments = toolCall?.function?.arguments || choice?.content;
    if (!rawArguments) throw new Error("AI provider returned no document tool arguments");

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawArguments);
    } catch {
      throw new Error("AI provider returned invalid JSON for generate_academic_docx");
    }

    return {
      document: DocumentSpecSchema.parse(parsed),
      providerId: this.config.id,
      model: response.model || this.config.model,
      usage: normalizeUsage(response.usage),
    };
  }

  private async requestCompletion(request: ArticleRequest): Promise<CompletionResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 90_000);
    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0.35,
          messages: buildMessages(request),
          tools: [{
            type: "function",
            function: {
              name: "generate_academic_docx",
              description: "Create a complete semantic academic article specification for deterministic DOCX rendering.",
              parameters: zodToJsonSchema(DocumentSpecSchema, {
                name: "DocumentSpec",
                target: "openAi",
                $refStrategy: "none",
              }),
            },
          }],
          tool_choice: { type: "function", function: { name: "generate_academic_docx" } },
        }),
      });

      if (!response.ok) {
        const details = (await response.text()).slice(0, 500);
        throw new ProviderHttpError(response.status, details);
      }
      return await response.json() as CompletionResponse;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class MockDocumentProvider implements DocumentProvider {
  async generate(request: ArticleRequest): Promise<GenerationResult> {
    validateArticleRequest(request);
    const title = request.topic.trim();
    const outline = request.outline?.filter(Boolean).slice(0, 8) || ["研究背景", "核心分析", "实践路径", "结论"];
    const blocks: DocumentSpecInput["blocks"] = outline.flatMap((heading, index) => [
      { type: "heading", level: 1, text: heading, numbered: true },
      {
        type: "paragraph",
        runs: [{ text: `${title}的${heading}需要结合研究对象、理论依据与可验证材料展开。当前为本地演示内容，第 ${index + 1} 节展示结构化生成、样式控制和 Word 渲染链路。` }],
        alignment: "justify",
        firstLineIndentChars: 2,
      },
    ]);
    const document = DocumentSpecSchema.parse({
      version: "1.0",
      fileName: title.slice(0, 60),
      metadata: {
        title,
        author: request.author,
        institution: request.institution,
        abstract: `本文围绕${title}展开结构化分析，用于验证论文生成与 Word 排版工具链。`,
        keywords: title.split(/[\s、，,]+/u).filter(Boolean).slice(0, 5),
        language: "zh-CN",
      },
      page: request.pageHints || {},
      style: request.styleHints || {},
      blocks,
    });
    return { document, providerId: "mock", model: "deterministic-local", usage: null };
  }
}

export function validateArticleRequest(request: ArticleRequest): void {
  const topic = request.topic.trim();
  const requirements = request.requirements.trim();
  if (topic.length < 2 || topic.length > 300) throw new Error("Topic must contain 2-300 characters");
  if (requirements.length < 2 || requirements.length > 20_000) throw new Error("Requirements must contain 2-20000 characters");
  if (request.targetCharacters && (request.targetCharacters < 500 || request.targetCharacters > 100_000)) {
    throw new Error("targetCharacters must be between 500 and 100000");
  }
}

function buildMessages(request: ArticleRequest) {
  return [
    {
      role: "system",
      content: [
        "你是严谨的中文学术写作助手。必须调用 generate_academic_docx，禁止输出 HTML、Markdown 或 OOXML。",
        "只陈述可由用户材料支持的事实；不要虚构作者、数据、参考文献、DOI 或调查结果。",
        "标题使用 heading block，正文使用 paragraph block，列表必须用 list block，表格仅用于真实行列数据。",
        "完整返回可被 schema 校验的文档规格。",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        topic: request.topic,
        requirements: request.requirements,
        outline: request.outline,
        author: request.author,
        institution: request.institution,
        targetCharacters: request.targetCharacters,
        styleHints: request.styleHints,
        pageHints: request.pageHints,
      }),
    },
  ];
}

async function withRetry<T>(operation: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ProviderHttpError && (error.status === 429 || error.status >= 500);
      if (!retryable || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (2 ** attempt)));
    }
  }
  throw lastError;
}

class ProviderHttpError extends Error {
  constructor(readonly status: number, details: string) {
    super(`AI provider returned ${status}: ${details}`);
  }
}

interface CompletionResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

function normalizeUsage(usage: CompletionResponse["usage"]): GenerationResult["usage"] {
  if (!usage) return null;
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  return { promptTokens, completionTokens, totalTokens: usage.total_tokens || promptTokens + completionTokens };
}
