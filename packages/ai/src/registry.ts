export interface ProviderConfig {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  allowedHosts: string[];
  timeoutMs?: number;
}
export function providersFromEnv(env: NodeJS.ProcessEnv = process.env): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  if (env.DEEPSEEK_API_KEY) {
    providers.push(validateProviderConfig({
      id: "deepseek",
      label: "DeepSeek",
      baseUrl: env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
      apiKey: env.DEEPSEEK_API_KEY,
      allowedHosts: ["api.deepseek.com"],
      timeoutMs: readTimeout(env.AI_REQUEST_TIMEOUT_MS),
    }));
  }

  if (env.RELAY_API_KEY && env.RELAY_BASE_URL && env.RELAY_MODEL) {
    providers.push(validateProviderConfig({
      id: "relay",
      label: "Approved relay",
      baseUrl: env.RELAY_BASE_URL,
      model: env.RELAY_MODEL,
      apiKey: env.RELAY_API_KEY,
      allowedHosts: splitHosts(env.RELAY_ALLOWED_HOSTS),
      timeoutMs: readTimeout(env.AI_REQUEST_TIMEOUT_MS),
    }));
  }

  return providers;
}

export function validateProviderConfig(config: ProviderConfig): ProviderConfig {
  const url = new URL(config.baseUrl);
  if (url.protocol !== "https:") {
    throw new Error(`Provider ${config.id} must use HTTPS`);
  }
  if (url.username || url.password) {
    throw new Error(`Provider ${config.id} base URL cannot contain credentials`);
  }
  if (!config.allowedHosts.length || !config.allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error(`Provider ${config.id} host is not in RELAY_ALLOWED_HOSTS`);
  }
  return {
    ...config,
    baseUrl: url.href.replace(/\/$/u, ""),
    allowedHosts: config.allowedHosts.map((host) => host.toLowerCase()),
  };
}

function splitHosts(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function readTimeout(value: string | undefined): number {
  const parsed = Number(value || 90_000);
  return Number.isFinite(parsed) ? Math.min(180_000, Math.max(10_000, parsed)) : 90_000;
}
