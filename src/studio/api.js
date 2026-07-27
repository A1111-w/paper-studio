const TOKEN_KEY = "wenhe.session.token";
const USER_KEY = "wenhe.session.user";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/u, "");

export function currentSession() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const rawUser = sessionStorage.getItem(USER_KEY);
  if (!token || !rawUser) return null;
  try {
    return { token, user: JSON.parse(rawUser) };
  } catch {
    clearSession();
    return null;
  }
}

export async function login(email, password) {
  const payload = await request("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    auth: false,
  });
  sessionStorage.setItem(TOKEN_KEY, payload.token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(payload.user));
  return payload;
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export async function listProviders() {
  return request("/v1/providers");
}

export async function listJobs() {
  return request("/v1/generations");
}

export async function createGeneration(input) {
  return request("/v1/generations", {
    method: "POST",
    headers: { "idempotency-key": `web-${crypto.randomUUID()}` },
    body: JSON.stringify(input),
  });
}

export async function extractTemplate(file) {
  const form = new FormData();
  form.set("template", file);
  return request("/v1/templates/extract", { method: "POST", body: form });
}

export async function getAdminOverview() {
  return request("/v1/admin/overview");
}

export async function downloadJob(job) {
  const response = await fetch(apiPath(`/v1/generations/${job.id}/download`), {
    headers: authorizationHeader(),
  });
  if (!response.ok) throw await apiError(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFileName(job.topic || "论文")}.docx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function request(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.auth !== false) {
    for (const [key, value] of Object.entries(authorizationHeader())) headers.set(key, value);
  }
  if (options.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(apiPath(url), { ...options, headers });
  if (!response.ok) throw await apiError(response);
  return response.json();
}

function apiPath(path) {
  return `${API_BASE_URL}${path}`;
}

function authorizationHeader() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function apiError(response) {
  const payload = await response.json().catch(() => ({}));
  const error = new Error(payload.message || payload.error || `服务返回 ${response.status}`);
  error.status = response.status;
  return error;
}

function safeFileName(value) {
  return String(value).replace(/[\\/:*?"<>|]/gu, "-").slice(0, 80);
}
