import fs from "node:fs";
import path from "node:path";

const DEFAULT_EXTERNAL_SERVICE_PORT = "3033";

export function resolveTradingOpsExternalServiceBaseUrl(options?: {
  repoRoot?: string;
  findWorkspaceRoot?: () => string;
}): string {
  const explicit = process.env.MISSION_CONTROL_EXTERNAL_SERVICE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/u, "");
  }

  const root = options?.repoRoot ?? options?.findWorkspaceRoot?.();
  const envPath = root ? path.join(root, ".env") : null;
  if (!envPath || !fs.existsSync(envPath)) {
    return `http://127.0.0.1:${DEFAULT_EXTERNAL_SERVICE_PORT}`;
  }

  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/^\s*PORT\s*=\s*(.+)\s*$/m);
  const port = (match?.[1]?.trim() ?? DEFAULT_EXTERNAL_SERVICE_PORT).replace(/^['"]|['"]$/gu, "") || DEFAULT_EXTERNAL_SERVICE_PORT;
  return `http://127.0.0.1:${port}`;
}
