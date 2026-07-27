import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "./studio/Sidebar";
import LoginView from "./studio/LoginView";
import ComposerView from "./studio/ComposerView";
import { AdminView, BillingView, JobsView, PlagiarismView, TemplatesView } from "./studio/Views";
import {
  clearSession,
  createGeneration,
  currentSession,
  downloadJob,
  extractTemplate,
  listJobs,
  listProviders,
  login,
} from "./studio/api";

const defaultProviders = [{ id: "mock", label: "本地演示", enabled: true }];

export default function App() {
  const initial = currentSession();
  const [session, setSession] = useState(initial);
  const [view, setView] = useState("composer");
  const [providers, setProviders] = useState(defaultProviders);
  const [jobs, setJobs] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [creating, setCreating] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const pollRef = useRef(null);

  const refreshJobs = useCallback(async (quiet = false) => {
    if (!session) return;
    if (!quiet) setJobsLoading(true);
    try {
      const payload = await listJobs();
      setJobs(payload.jobs || []);
    } catch (error) {
      if (error.status === 401) logout();
    } finally {
      if (!quiet) setJobsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return undefined;
    Promise.all([listProviders(), listJobs()])
      .then(([providerPayload, jobPayload]) => {
        setProviders(providerPayload.providers?.length ? providerPayload.providers : defaultProviders);
        setJobs(jobPayload.jobs || []);
      })
      .catch((error) => {
        if (error.status === 401) logout();
      });
    return undefined;
  }, [session]);

  useEffect(() => {
    const hasOpenJobs = jobs.some((job) => job.status === "queued" || job.status === "running");
    if (!session || !hasOpenJobs) return undefined;
    pollRef.current = window.setInterval(() => refreshJobs(true), 1800);
    return () => window.clearInterval(pollRef.current);
  }, [jobs, refreshJobs, session]);

  async function handleLogin(email, password) {
    setAuthLoading(true);
    setAuthError("");
    try {
      const payload = await login(email, password);
      setSession({ token: payload.token, user: payload.user });
    } catch (error) {
      setAuthError(error.message === "Failed to fetch" ? "无法连接 API，请先启动本地开发服务" : error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function logout() {
    clearSession();
    setSession(null);
    setJobs([]);
    setView("composer");
  }

  async function handleCreate(input) {
    setCreating(true);
    try {
      const payload = await createGeneration(input);
      setJobs((current) => [payload.job, ...current.filter((job) => job.id !== payload.job.id)]);
      setView("jobs");
    } finally {
      setCreating(false);
    }
  }

  async function handleTemplate(file) {
    const payload = await extractTemplate(file);
    const item = normalizeTemplate(payload.template);
    setTemplates((current) => [item, ...current.filter((template) => template.fileName !== item.fileName)]);
    return item;
  }

  if (!session) return <LoginView onLogin={handleLogin} loading={authLoading} error={authError} />;

  return (
    <div className="studio-shell">
      <Sidebar
        active={view}
        onNavigate={setView}
        user={session.user}
        onLogout={logout}
        onOpenBookSite={() => window.open(import.meta.env.VITE_BOOK_SITE_URL || "https://books.example.com", "_blank", "noopener,noreferrer")}
      />
      {view === "composer" ? <ComposerView providers={providers} onCreate={handleCreate} onExtractTemplate={handleTemplate} busy={creating} templates={templates} /> : null}
      {view === "jobs" ? <JobsView jobs={jobs} loading={jobsLoading} onRefresh={() => refreshJobs()} onDownload={downloadJob} onCreate={() => setView("composer")} /> : null}
      {view === "templates" ? <TemplatesView templates={templates} onUpload={handleTemplate} /> : null}
      {view === "billing" ? <BillingView /> : null}
      {view === "plagiarism" ? <PlagiarismView /> : null}
      {view === "admin" && session.user.role === "admin" ? <AdminView /> : null}
    </div>
  );
}
function normalizeTemplate(template) {
  const style = template.suggestedStyle || {};
  const parts = [style.eastAsiaBodyFont, style.bodySizePt ? `${style.bodySizePt}pt` : "", style.headingFont ? `标题 ${style.headingFont}` : ""].filter(Boolean);
  return {
    id: crypto.randomUUID(),
    fileName: template.fileName,
    summary: parts.join(" · ") || `提取 ${template.profile?.paragraphStyles?.length || 0} 个样式`,
    suggestedStyle: Object.fromEntries(Object.entries(style).filter(([, value]) => value !== undefined)),
    profile: template.profile,
  };
}
