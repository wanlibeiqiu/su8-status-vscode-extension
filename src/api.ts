import type {
  RelayBalanceResult,
  RelayBalanceSettings,
  UsageSubscription,
} from "./types";

interface NumberByPath {
  value: number;
  path: string;
}

interface UsageMeta {
  isValid: boolean;
  invalidCode: string | null;
  invalidMessage: string | null;
  unit: string;
  planName: string;
  todayLimit: number | null;
  todayRemaining: number | null;
  todayRemainingWithCarryover: number | null;
  subscriptions: UsageSubscription[];
  concurrencyPlan: number | null;
  concurrencyBalance: number | null;
}

function createAbortController(): AbortController | undefined {
  if (typeof globalThis.AbortController === "function") {
    const Ctor = globalThis.AbortController as typeof AbortController;
    return new Ctor();
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function pathParts(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
}

function readByPath(payload: unknown, path: string): unknown {
  const parts = pathParts(path);
  let current: unknown = payload;

  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/,/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function asOptionalNumber(value: unknown): number | null {
  const num = toFiniteNumber(value);
  return num === null ? null : num;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const v = value.trim();
  return v ? v : null;
}

function uniquePaths(paths: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of paths) {
    const path = raw.trim();
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);
    out.push(path);
  }

  return out;
}

function pickNumber(payload: unknown, paths: string[]): NumberByPath | null {
  for (const path of uniquePaths(paths)) {
    const value = toFiniteNumber(readByPath(payload, path));
    if (value !== null) {
      return { value, path };
    }
  }
  return null;
}

function resolveKnownApiError(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (payload.ok === false || payload.success === false) {
    if (typeof payload.msg === "string" && payload.msg.trim()) {
      return payload.msg;
    }
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
    return "远端接口返回失败";
  }

  if (isRecord(payload.error)) {
    const message = payload.error.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }

  return null;
}

function parseSubscriptions(payload: unknown, unit: string): UsageSubscription[] {
  const raw = isRecord(payload) ? payload.subscriptions : undefined;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((sub): UsageSubscription => {
    const record = isRecord(sub) ? sub : {};
    const planId = asOptionalString(record.planId) || "";
    const planName = asOptionalString(record.planName);
    const remaining = asOptionalNumber(record.remaining);
    const todayLimit = asOptionalNumber(record.todayLimit);
    const todayRemaining = asOptionalNumber(record.todayRemaining);
    const todayRemainingWithCarryover = asOptionalNumber(record.todayRemainingWithCarryover);
    const subUnit = asOptionalString(record.unit) || unit;

    return {
      planId,
      planName,
      remaining,
      todayLimit,
      todayRemaining,
      todayRemainingWithCarryover,
      unit: subUnit,
      isValid: record.isValid !== false,
    };
  });
}

function parseUsageMeta(payload: unknown): UsageMeta {
  const record = isRecord(payload) ? payload : {};
  const invalidCode = asOptionalString(record.invalidCode);
  const knownError = resolveKnownApiError(payload);
  const invalidMessage = asOptionalString(record.invalidMessage) || knownError;

  return {
    isValid: !knownError && record.isValid !== false && invalidCode !== "NO_QUOTA",
    invalidCode,
    invalidMessage,
    unit: asOptionalString(record.unit) || "USD",
    planName: asOptionalString(record.planName) || "总余额",
    todayLimit: asOptionalNumber(record.todayLimit),
    todayRemaining: asOptionalNumber(record.todayRemaining),
    todayRemainingWithCarryover: asOptionalNumber(record.todayRemainingWithCarryover),
    subscriptions: parseSubscriptions(record, asOptionalString(record.unit) || "USD"),
    concurrencyPlan: asOptionalNumber(readByPath(record, "concurrency.plan")),
    concurrencyBalance: asOptionalNumber(readByPath(record, "concurrency.balance")),
  };
}

function resolveBalance(
  payload: unknown,
  settings: RelayBalanceSettings,
  usageMeta: UsageMeta
): Omit<RelayBalanceResult, "url" | "fetchedAt"> {
  const base = {
    isValid: usageMeta.isValid,
    invalidCode: usageMeta.invalidCode,
    invalidMessage: usageMeta.invalidMessage,
    unit: usageMeta.unit,
    planName: usageMeta.planName,
    todayLimit: usageMeta.todayLimit,
    todayRemaining: usageMeta.todayRemaining,
    todayRemainingWithCarryover: usageMeta.todayRemainingWithCarryover,
    subscriptions: usageMeta.subscriptions,
    concurrencyPlan: usageMeta.concurrencyPlan,
    concurrencyBalance: usageMeta.concurrencyBalance,
  };

  const balancePart = pickNumber(payload, ["balance", "data.balance"]);
  const planPart = pickNumber(payload, ["plan_remaining", "data.plan_remaining"]);

  const direct = pickNumber(payload, [
    settings.balancePath,
    "remaining",
    "data.remaining",
    "data.balance",
    "balance",
    "data.remainingBalance",
    "remainingBalance",
    "data.remain",
    "remain",
    "data.remain_quota",
    "remain_quota",
    "total_available",
  ]);

  if (direct) {
    const hasResolvedParts =
      balancePart && planPart && Math.abs(direct.value - (balancePart.value + planPart.value)) <= 1e-6;

    return {
      ...base,
      rawBalance: direct.value,
      displayBalance: direct.value * settings.valueScale,
      balancePath: direct.path,
      mode: "direct",
      balancePart: hasResolvedParts ? balancePart.value : undefined,
      planRemainingPart: hasResolvedParts ? planPart.value : undefined,
    };
  }

  if (balancePart && planPart) {
    const raw = balancePart.value + planPart.value;
    return {
      ...base,
      rawBalance: raw,
      displayBalance: raw * settings.valueScale,
      balancePath: `${balancePart.path} + ${planPart.path}`,
      mode: "balancePlusPlan",
      balancePart: balancePart.value,
      planRemainingPart: planPart.value,
    };
  }

  const quota = pickNumber(payload, [settings.quotaPath, "data.quota", "quota", "data.totalQuota", "totalQuota"]);
  const used = pickNumber(payload, [
    settings.usedPath,
    "data.used_quota",
    "used_quota",
    "data.usedQuota",
    "usedQuota",
    "data.consumed",
    "consumed",
  ]);

  if (quota && used) {
    const raw = quota.value - used.value;
    return {
      ...base,
      rawBalance: raw,
      displayBalance: raw * settings.valueScale,
      balancePath: `${quota.path} - ${used.path}`,
      mode: "quotaMinusUsed",
      quota: quota.value,
      used: used.value,
    };
  }

  if (!usageMeta.isValid && usageMeta.invalidCode === "NO_QUOTA") {
    return {
      ...base,
      rawBalance: 0,
      displayBalance: 0,
      balancePath: "invalidCode=NO_QUOTA",
      mode: "noQuota",
    };
  }

  throw new Error(
    "未能在响应中解析余额。请检查 relayBalance.balancePath 或 relayBalance.quotaPath / relayBalance.usedPath"
  );
}

async function safeReadText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const oneLine = text.replace(/\s+/g, " ").trim();
    return oneLine.slice(0, 160);
  } catch {
    return "";
  }
}

function buildAuthValue(settings: RelayBalanceSettings): string {
  if (!settings.apiKey) {
    return "";
  }
  if (!settings.authScheme) {
    return settings.apiKey;
  }
  return `${settings.authScheme} ${settings.apiKey}`;
}

export function buildBalanceRequestUrl(settings: RelayBalanceSettings): string {
  if (/^https?:\/\//i.test(settings.balanceEndpoint)) {
    return settings.balanceEndpoint;
  }
  if (!settings.baseUrl) {
    throw new Error("未配置 relayBalance.baseUrl");
  }
  if (!settings.balanceEndpoint.startsWith("/")) {
    return `${settings.baseUrl}/${settings.balanceEndpoint}`;
  }
  return `${settings.baseUrl}${settings.balanceEndpoint}`;
}

export function resolveBalanceFromPayload(
  payload: unknown,
  settings: RelayBalanceSettings
): Omit<RelayBalanceResult, "url" | "fetchedAt"> {
  const usageMeta = parseUsageMeta(payload);
  return resolveBalance(payload, settings, usageMeta);
}

export async function fetchRelayBalance(settings: RelayBalanceSettings): Promise<RelayBalanceResult> {
  const url = buildBalanceRequestUrl(settings);
  const ctrl = createAbortController();

  const timeout = setTimeout(() => {
    try {
      ctrl?.abort();
    } catch {
      // noop
    }
  }, settings.timeoutMs);

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (settings.requestMethod === "POST") {
    headers["Content-Type"] = "application/json";
  }

  const authHeader = settings.authHeader.trim();
  if (authHeader && settings.apiKey) {
    headers[authHeader] = buildAuthValue(settings);
  }

  const init: RequestInit = {
    method: settings.requestMethod,
    headers,
  };

  if (settings.requestMethod === "POST") {
    init.body = "{}";
  }
  if (ctrl) {
    init.signal = ctrl.signal;
  }

  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await safeReadText(response);
      throw new Error(`HTTP ${response.status}${text ? `: ${text}` : ""}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("接口返回不是合法 JSON");
    }

    const usageMeta = parseUsageMeta(payload);
    const knownError = resolveKnownApiError(payload);
    if (knownError && usageMeta.invalidCode !== "NO_QUOTA") {
      throw new Error(knownError);
    }

    const resolved = resolveBalance(payload, settings, usageMeta);
    return {
      ...resolved,
      url,
      fetchedAt: new Date(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
