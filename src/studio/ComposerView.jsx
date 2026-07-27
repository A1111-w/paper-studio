import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  FileInput,
  FileText,
  LoaderCircle,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

const purposes = ["课程论文", "毕业论文", "调研报告", "文献综述", "项目申报"];
const lengths = [3000, 5000, 8000, 12000];

export default function ComposerView({ providers, onCreate, onExtractTemplate, busy, templates }) {
  const [topic, setTopic] = useState("");
  const [purpose, setPurpose] = useState(purposes[0]);
  const [targetCharacters, setTargetCharacters] = useState(5000);
  const [providerId, setProviderId] = useState("mock");
  const [requirements, setRequirements] = useState("");
  const [outline, setOutline] = useState(["研究背景", "现状与问题", "改进路径", "结论"]);
  const [outlineDraft, setOutlineDraft] = useState("");
  const [formatMode, setFormatMode] = useState("paste");
  const [formatInstructions, setFormatInstructions] = useState("一级标题：黑体三号；正文：宋体小四；1.5 倍行距；首行缩进 2 字符；A4 纸。 ");
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]?.id || "");
  const [fileBusy, setFileBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef(null);

  const activeTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplate),
    [selectedTemplate, templates],
  );

  function addOutline() {
    const value = outlineDraft.trim();
    if (!value || outline.length >= 12) return;
    setOutline((current) => [...current, value]);
    setOutlineDraft("");
  }

  async function handleFile(file) {
    if (!file) return;
    setFileBusy(true);
    setError("");
    try {
      const template = await onExtractTemplate(file);
      setSelectedTemplate(template.id);
      setFormatMode("template");
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setFileBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (topic.trim().length < 2) {
      setError("先输入至少 2 个字的文章主题");
      return;
    }
    setError("");
    const formatText = formatMode === "template" && activeTemplate
      ? `沿用格式范本 ${activeTemplate.fileName}，提取样式：${activeTemplate.summary}`
      : formatInstructions.trim();
    try {
      await onCreate({
        topic: topic.trim(),
        requirements: [`用途：${purpose}`, requirements.trim(), `格式：${formatText}`].filter(Boolean).join("\n"),
        providerId,
        outline,
        targetCharacters,
        styleHints: activeTemplate?.suggestedStyle,
      });
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  return (
    <main className="studio-main composer-main">
      <header className="page-heading">
        <div><h1>新建文章</h1><p>主题、内容结构与 Word 格式一次提交</p></div>
        <div className="service-state"><span /> 生成服务可用</div>
      </header>

      <form className="composer-layout" onSubmit={submit}>
        <section className="composer-form">
          <div className="form-section">
            <div className="form-section-title"><span>01</span><div><h2>文章内容</h2><p>定义写作任务和内容边界</p></div></div>
            <label className="large-field"><span>文章主题</span><input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：生成式人工智能对高校写作教学的影响研究" /></label>
            <div className="field-grid three-columns">
              <label><span>文章用途</span><select value={purpose} onChange={(event) => setPurpose(event.target.value)}>{purposes.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>目标篇幅</span><select value={targetCharacters} onChange={(event) => setTargetCharacters(Number(event.target.value))}>{lengths.map((item) => <option value={item} key={item}>{item.toLocaleString()} 字</option>)}</select></label>
              <label><span>生成渠道</span><select value={providerId} onChange={(event) => setProviderId(event.target.value)}>{providers.map((item) => <option value={item.id} disabled={!item.enabled} key={item.id}>{item.label}</option>)}</select></label>
            </div>
            <label><span>补充要求</span><textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} rows={4} placeholder="研究对象、时间范围、必须覆盖的观点、禁止虚构的内容等" /></label>
          </div>

          <div className="form-section">
            <div className="form-section-title"><span>02</span><div><h2>文章提纲</h2><p>最多 12 个一级章节</p></div></div>
            <div className="outline-list">
              {outline.map((item, index) => (
                <div className="outline-row" key={`${item}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><input value={item} onChange={(event) => setOutline((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} /><button type="button" title="删除章节" onClick={() => setOutline((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button></div>
              ))}
              <div className="outline-add"><input value={outlineDraft} onChange={(event) => setOutlineDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addOutline(); } }} placeholder="添加章节" /><button type="button" onClick={addOutline}><Plus size={15} />添加</button></div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title"><span>03</span><div><h2>Word 格式</h2><p>复制要求或上传 DOCX 范本</p></div></div>
            <div className="mode-tabs" role="tablist">
              <button className={formatMode === "paste" ? "active" : ""} type="button" onClick={() => setFormatMode("paste")}><FileText size={16} />复制格式要求</button>
              <button className={formatMode === "template" ? "active" : ""} type="button" onClick={() => setFormatMode("template")}><FileInput size={16} />DOCX 范本</button>
            </div>
            {formatMode === "paste" ? (
              <label><span>格式说明</span><textarea className="format-textarea" value={formatInstructions} onChange={(event) => setFormatInstructions(event.target.value)} rows={5} /></label>
            ) : (
              <div className="template-picker">
                <button className="upload-template" type="button" onClick={() => fileInput.current?.click()} disabled={fileBusy}>
                  {fileBusy ? <LoaderCircle className="spin" size={20} /> : <Upload size={20} />}
                  <strong>{fileBusy ? "正在解析格式" : "上传 DOCX 格式范本"}</strong><span>最大 20 MB，仅提取样式与页面设置</span>
                </button>
                <input ref={fileInput} hidden type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => handleFile(event.target.files?.[0])} />
                {templates.length ? <div className="template-options">{templates.map((template) => <button className={selectedTemplate === template.id ? "active" : ""} type="button" onClick={() => setSelectedTemplate(template.id)} key={template.id}><div><strong>{template.fileName}</strong><span>{template.summary}</span></div>{selectedTemplate === template.id ? <Check size={17} /> : null}</button>)}</div> : null}
              </div>
            )}
          </div>
        </section>

        <aside className="composer-summary">
          <div className="summary-top"><Sparkles size={19} /><div><strong>任务预览</strong><span>结构化生成 + 确定性 Word 渲染</span></div></div>
          <dl><div><dt>文章用途</dt><dd>{purpose}</dd></div><div><dt>目标篇幅</dt><dd>{targetCharacters.toLocaleString()} 字</dd></div><div><dt>章节数量</dt><dd>{outline.length} 节</dd></div><div><dt>模型渠道</dt><dd>{providers.find((item) => item.id === providerId)?.label || providerId}</dd></div></dl>
          <div className="workflow-list"><div><span>1</span><p><strong>内容生成</strong><small>AI 只输出受约束的文档结构</small></p></div><div><span>2</span><p><strong>结构校验</strong><small>拦截超长、错层级与非法字段</small></p></div><div><span>3</span><p><strong>Word 排版</strong><small>服务器统一字体、标题与页面</small></p></div></div>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <button className="primary-button create-button" type="submit" disabled={busy || !outline.length}>{busy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}{busy ? "正在提交" : "开始生成 Word"}{!busy ? <ArrowRight size={18} /> : null}</button>
          <p className="summary-note">提交后可离开页面，任务会在后台继续运行。</p>
        </aside>
      </form>
    </main>
  );
}
