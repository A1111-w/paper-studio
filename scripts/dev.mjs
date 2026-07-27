import { spawn } from "node:child_process";
import process from "node:process";

const pnpmEntry = process.env.npm_execpath;
if (!pnpmEntry) throw new Error("pnpm must invoke this development script");
const api = spawn(process.execPath, [pnpmEntry, "--filter", "@wenhe/api", "dev"], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development" },
});
const web = spawn(process.execPath, [pnpmEntry, "exec", "vite"], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development" },
});

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  api.kill();
  web.kill();
  process.exitCode = exitCode;
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
api.on("exit", (code) => { if (!stopping) stop(code || 0); });
web.on("exit", (code) => { if (!stopping) stop(code || 0); });
