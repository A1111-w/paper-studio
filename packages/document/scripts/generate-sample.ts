import { resolve } from "node:path";
import { renderDocumentToFile } from "../src/index.js";

const outputDirectory = resolve(process.argv[2] ?? "artifacts");

const result = await renderDocumentToFile({
  fileName: "中文学术论文示例.docx",
  metadata: {
    title: "生成式人工智能辅助学术写作的质量控制研究",
    subtitle: "基于结构化文档工具调用的实现路径",
    author: "文禾示例作者",
    institution: "文禾研究院",
    date: "2026年7月",
    abstract: "本文研究生成式人工智能在学术写作场景中的结构化输出方法，重点讨论内容生成与文档排版解耦后，字体、标题层级、表格和页眉页脚的一致性控制。",
    keywords: ["生成式人工智能", "学术写作", "结构化输出", "Word排版"],
  },
  header: { text: "文禾研究院学术论文" },
  footer: { text: "结构化文档生成研究", showPageNumber: true },
  blocks: [
    { type: "heading", level: 1, text: "绪论", numbered: true },
    {
      type: "paragraph",
      runs: [
        { text: "直接让大模型输出二进制 Word 文档难以稳定控制格式。" },
        { text: "结构化 DocumentSpec", bold: true },
        { text: " 将内容表达与确定性渲染分离，可显著提高可维护性。" },
      ],
    },
    { type: "heading", level: 2, text: "系统设计原则", numbered: true },
    {
      type: "list",
      style: "decimal",
      items: [
        { text: "模型仅生成经过 Schema 校验的语义块。", level: 0 },
        { text: "服务端使用固定版式 token 渲染 DOCX。", level: 0 },
        { text: "模板文件在限额与 ZIP 炸弹防护后才提取样式。", level: 0 },
      ],
    },
    {
      type: "table",
      caption: "表1 文档生成链路的职责划分",
      headers: [{ text: "阶段" }, { text: "输入" }, { text: "输出" }],
      rows: [
        [{ text: "内容生成" }, { text: "主题与格式要求" }, { text: "DocumentSpec" }],
        [{ text: "格式校验" }, { text: "DocumentSpec" }, { text: "受限语义树" }],
        [{ text: "确定性渲染" }, { text: "受限语义树" }, { text: "DOCX" }],
      ],
      columnWidths: [0.22, 0.38, 0.4],
    },
    { type: "pageBreak" },
    { type: "heading", level: 1, text: "结论", numbered: true },
    { type: "paragraph", runs: [{ text: "结构化工具契约能够同时约束模型输入、降低文档注入风险，并使排版结果具备可测试性与可重复性。" }] },
  ],
}, outputDirectory);

process.stdout.write(`${result.path} (${result.bytes} bytes)\n`);
