import * as vscode from "vscode";
import type { HttpMethod, RelayBalanceSettings } from "./types";

const CONFIG_SECTION = "relayBalance";

export const SU8_SITE_URL = "https://www.su8.codes";
export const SU8_CODEX_BASE_URL = "https://www.su8.codes/codex/v1";

function readString(cfg: vscode.WorkspaceConfiguration, key: string, fallback = ""): string {
  const value = cfg.get<unknown>(key, fallback);
  return typeof value === "string" ? value.trim() : fallback;
}

function readNumber(cfg: vscode.WorkspaceConfiguration, key: string, fallback: number): number {
  const value = cfg.get<unknown>(key, fallback);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function ensureLeadingSlash(input: string): string {
  if (!input) {
    return "";
  }
  return input.startsWith("/") ? input : `/${input}`;
}

function normalizeMethod(input: string): HttpMethod {
  return input.toUpperCase() === "POST" ? "POST" : "GET";
}

export function readApiKeyFromEnv(): string {
  const candidates = [
    process.env.RELAY_BALANCE_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.ANTHROPIC_AUTH_TOKEN,
    process.env.key88,
  ];

  for (const key of candidates) {
    if (typeof key === "string" && key.trim()) {
      return key.trim();
    }
  }
  return "";
}

function normalizeDashboardUrl(dashboardUrl: string): string {
  if (!dashboardUrl) {
    return "";
  }
  if (/^https?:\/\//i.test(dashboardUrl)) {
    return dashboardUrl;
  }
  return `${SU8_SITE_URL}${ensureLeadingSlash(dashboardUrl)}`;
}

export function readLegacyConfiguredApiKey(): string {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return readString(cfg, "apiKey", "");
}

export function readRelaySettings(apiKeyOverride = ""): RelayBalanceSettings {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const endpointRaw = readString(cfg, "balanceEndpoint", "/usage");

  const settings: RelayBalanceSettings = {
    baseUrl: SU8_CODEX_BASE_URL,
    balanceEndpoint: /^https?:\/\//i.test(endpointRaw) ? endpointRaw : ensureLeadingSlash(endpointRaw),
    dashboardUrl: normalizeDashboardUrl(readString(cfg, "dashboardUrl", "")),
    requestMethod: normalizeMethod(readString(cfg, "requestMethod", "GET")),
    apiKey: apiKeyOverride.trim() || readApiKeyFromEnv(),
    authHeader: readString(cfg, "authHeader", "Authorization") || "Authorization",
    authScheme: readString(cfg, "authScheme", "Bearer"),
    balancePath: readString(cfg, "balancePath", "remaining"),
    quotaPath: readString(cfg, "quotaPath", "data.quota"),
    usedPath: readString(cfg, "usedPath", "data.used_quota"),
    valueScale: readNumber(cfg, "valueScale", 1),
    timeoutMs: Math.max(1000, Math.floor(readNumber(cfg, "timeoutMs", 8000))),
    refreshIntervalSeconds: Math.max(10, Math.floor(readNumber(cfg, "refreshIntervalSeconds", 60))),
    statusLabel: readString(cfg, "statusLabel", "余额"),
    currencySymbol: readString(cfg, "currencySymbol", "$") || "$",
  };

  return settings;
}
