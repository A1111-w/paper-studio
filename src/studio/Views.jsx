import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Coins,
  Download,
  FileClock,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
  SearchX,
  ServerCog,
  ShieldCheck,
  Upload,
  Users,
  WalletCards,
} from "lucide-react";
import { getAdminOverview } from "./api";

export function JobsView({ jobs, loading, onRefresh, onDownload, onCreate }) {
  return (
    <main className="studio-main">
      <header className="page-heading"><div><h1>生成任务</h1><p>查看文章生成、校验和 Word 渲染进度</p></div><div className="heading-actions"><button className="secondary-button icon-text" type="button" onClick={onRefresh}><RefreshCw size={16} />刷新</button><button className="primary-button small" type="button" onClick={onCreate}><Plus size={16} />新建文章</button></div></header>
      <section className="table-surface">
        <div className="table-header"><span>任务</span><span>渠道</span><span>状态</span><span>进度</span><span>更新时间</span><span /></div>
        {loading ? <div className="empty-table"><LoaderCircle className="spin" size={22} />正在读取任务</div> : null}
        {!loading && !jobs.length ? <div className="empty-table"><FileClock size={26} /><strong>还没有生成任务</strong><button type="button" onClick={onCreate}>创建第一篇文章</button></div> : null}
        {!loading ? jobs.map((job) => <JobRow job={job} onDownload={onDownload} key={job.id} />) : null}
      </section>
    </main>
  );
}

function JobRow({ job, onDownload }) {
  const status = {
    queued: [Clock3, "等待中", "queued"],
    running: [LoaderCircle, "生成中", "running"],
    succeeded: [CheckCircle2, "已完成", "succeeded"],
    failed: [AlertTriangle, "失败", "failed"],
  }[job.status] || [Clock3, job.status, "queued"];
  const Icon = status[0];
  return (
    <div className="table-row">
      <div className="job-title"><FileText size={18} /><div><strong>{job.topic}</strong><span>{job.id.slice(0, 8)}</span></div></div>
      <span>{job.providerId === "mock" ? "本地演示" : job.providerId}</span>
      <span className={`status-label ${status[2]}`}><Icon className={job.status === "running" ? "spin" : ""} size={14} />{status[1]}</span>
      <div className="job-progress"><span><i style={{ width: `${job.progress}%` }} /></span><small>{job.progress}%</small></div>
      <span>{formatTime(job.updatedAt)}</span>
      <div className="row-action">{job.status === "succeeded" ? <button type="button" title="下载 Word" onClick={() => onDownload(job)}><Download size={17} /></button> : null}</div>
    </div>
  );
}

export function TemplatesView({ templates, onUpload }) {
  const [busy, setBusy] = useState(false);
  return (
    <main className="studio-main">
      <header className="page-heading"><div><h1>格式模板</h1><p>从 DOCX 范本提取页面、正文和标题样式</p></div><label className="primary-button small upload-label"><Upload size={16} />上传范本<input hidden type="file" accept=".docx" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setBusy(true); try { await onUpload(file); } finally { setBusy(false); } }} /></label></header>
      <section className="template-library">
        <article className="template-card default-template"><div className="template-document"><span /><span /><span /><span /></div><div><strong>中文学术默认格式</strong><p>宋体小四、黑体标题、1.5 倍行距、A4</p><small>系统内置</small></div></article>
        {templates.map((template) => <article className="template-card" key={template.id}><div className="template-document custom"><span /><span /><span /><span /></div><div><strong>{template.fileName}</strong><p>{template.summary}</p><small>已完成安全解析</small></div></article>)}
        {busy ? <article className="template-card loading-card"><LoaderCircle className="spin" size={22} /><strong>正在解析 DOCX 样式</strong></article> : null}
      </section>
    </main>
  );
}

export function BillingView() {
  return <ReservedView icon={WalletCards} title="账户充值" status="方案待确认" copy="充值入口暂未开放，支付渠道确定后再接入。" facts={["余额账本使用独立交易流水", "支付回调将校验签名与幂等键", "不会把支付密钥下发到浏览器"]} />;
}

export function PlagiarismView() {
  return <ReservedView icon={SearchX} title="查重检测" status="等待接入" copy="查重服务由你完成后再适配，当前不上传论文、不调用任何检测接口。" facts={["本模块与文章生成任务分离", "接入前会先确定请求与报告契约", "不会伪造商业数据库结果"]} />;
}

function ReservedView({ icon: Icon, title, status, copy, facts }) {
  return (
    <main className="studio-main">
      <header className="page-heading"><div><h1>{title}</h1><p>{status}</p></div></header>
      <section className="reserved-layout"><div className="reserved-main"><Icon size={30} /><span className="reserved-status">{status}</span><h2>{copy}</h2><div className="reserved-rule" /><ul>{facts.map((fact) => <li key={fact}><ShieldCheck size={16} />{fact}</li>)}</ul></div><aside><strong>当前状态</strong><dl><div><dt>功能开关</dt><dd>关闭</dd></div><div><dt>接口调用</dt><dd>0</dd></div><div><dt>数据上传</dt><dd>无</dd></div></dl></aside></section>
    </main>
  );
}

export function AdminView() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { getAdminOverview().then(setOverview).catch((loadError) => setError(loadError.message)); }, []);
  const jobs = overview?.jobs;
  return (
    <main className="studio-main">
      <header className="page-heading"><div><h1>管理后台</h1><p>任务、渠道和功能开关总览</p></div><div className="admin-role"><ShieldCheck size={15} />管理员会话</div></header>
      {error ? <div className="form-error">{error}</div> : null}
      <section className="metric-strip">
        <Metric icon={FileClock} label="总任务" value={jobs?.total ?? "-"} />
        <Metric icon={LoaderCircle} label="运行中" value={jobs?.running ?? "-"} />
        <Metric icon={CheckCircle2} label="已完成" value={jobs?.succeeded ?? "-"} />
        <Metric icon={ServerCog} label="Worker 并发" value={jobs ? `${jobs.activeWorkers}/${jobs.maxConcurrency}` : "-"} />
      </section>
      <section className="admin-grid">
        <div className="admin-section"><div className="panel-title"><ServerCog size={18} /><strong>模型渠道</strong></div>{overview?.providers?.length ? overview.providers.map((provider) => <div className="admin-list-row" key={provider.id}><div><strong>{provider.label}</strong><span>{provider.model}</span></div><span className="online-dot">{provider.host}</span></div>) : <div className="empty-panel">尚未配置线上渠道</div>}</div>
        <div className="admin-section"><div className="panel-title"><Coins size={18} /><strong>功能开关</strong></div><div className="admin-list-row"><div><strong>账户充值</strong><span>provider 尚未确定</span></div><span className="off-label">关闭</span></div><div className="admin-list-row"><div><strong>查重检测</strong><span>等待业务接口</span></div><span className="off-label">关闭</span></div></div>
        <div className="admin-section wide"><div className="panel-title"><Users size={18} /><strong>安全基线</strong></div><div className="security-grid"><span><CheckCircle2 size={15} />管理员 RBAC</span><span><CheckCircle2 size={15} />请求速率限制</span><span><CheckCircle2 size={15} />中转站域名白名单</span><span><CheckCircle2 size={15} />任务幂等键</span><span><CheckCircle2 size={15} />DOCX ZIP bomb 防护</span><span><CheckCircle2 size={15} />服务端 API 密钥</span></div></div>
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value }) { return <article><Icon size={20} /><div><span>{label}</span><strong>{value}</strong></div></article>; }
function formatTime(value) { try { return new Date(value).toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return value; } }
