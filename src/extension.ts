import * as vscode from "vscode";
import { fetchRelayBalance } from "./api";
import { readApiKeyFromEnv, readLegacyConfiguredApiKey, readRelaySettings, SU8_SITE_URL } from "./config";
import { showStatusMenu } from "./statusMenu";
import type { RelayBalanceResult } from "./types";

const MENU_COMMAND = "su8-codes-balance.menu";
const REFRESH_COMMAND = "su8-codes-balance.refresh";
const API_KEY_SECRET = "su8-codes-balance.apiKey";

let lastBalance: number | undefined;
let flashTimeout: NodeJS.Timeout | undefined;
let refreshTimer: NodeJS.Timeout | undefined;
let latestResult: RelayBalanceResult | undefined;
let extensionContext: vscode.ExtensionContext | undefined;

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;

  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.name = "su8-codes-balance";
  statusItem.command = MENU_COMMAND;
  context.subscriptions.push(statusItem);

  const menuCmd = vscode.commands.registerCommand(MENU_COMMAND, async () => {
    await showStatusMenu(statusItem, {
      refreshStatus,
      getLatestResult: () => latestResult,
      getStoredApiKey,
      setStoredApiKey,
      getEnvApiKey: readApiKeyFromEnv,
    });
  });
  context.subscriptions.push(menuCmd);

  const refreshCmd = vscode.commands.registerCommand(REFRESH_COMMAND, async () => {
    await refreshStatus(statusItem);
  });
  context.subscriptions.push(refreshCmd);

  statusItem.show();

  void initializeApiKeyMigration().then(async () => {
    await refreshStatus(statusItem);
    scheduleNextRefresh(statusItem);
  });

  context.subscriptions.push({
    dispose: () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = undefined;
      }
    },
  });
}

export function deactivate() {}

async function initializeApiKeyMigration() {
  const existingSecret = await getStoredApiKey();
  if (existingSecret) {
    return;
  }

  const legacyApiKey = readLegacyConfiguredApiKey();
  if (!legacyApiKey) {
    return;
  }

  await setStoredApiKey(legacyApiKey);

  try {
    await vscode.workspace.getConfiguration("relayBalance").update("apiKey", "", vscode.ConfigurationTarget.Global);
  } catch {
    // noop
  }

  void vscode.window.showInformationMessage("已将 `relayBalance.apiKey` 迁移到安全存储，后续请在余额菜单中通过安全输入框维护密钥。");
}

async function getStoredApiKey(): Promise<string> {
  return (await extensionContext?.secrets.get(API_KEY_SECRET))?.trim() || "";
}

async function setStoredApiKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!extensionContext) {
    return;
  }

  if (trimmed) {
    await extensionContext.secrets.store(API_KEY_SECRET, trimmed);
    return;
  }

  await extensionContext.secrets.delete(API_KEY_SECRET);
}

async function resolveSettings() {
  const storedApiKey = await getStoredApiKey();
  return readRelaySettings(storedApiKey);
}

function scheduleNextRefresh(item: vscode.StatusBarItem) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = undefined;
  }

  void resolveSettings().then((settings) => {
    refreshTimer = setTimeout(async () => {
      await refreshStatus(item);
      scheduleNextRefresh(item);
    }, settings.refreshIntervalSeconds * 1000);
  });
}

async function refreshStatus(item: vscode.StatusBarItem) {
  const settings = await resolveSettings();

  try {
    if (!settings.apiKey) {
      resetFlash(item);
      lastBalance = undefined;
      latestResult = undefined;
      item.text = `$(credit-card) ${settings.statusLabel} ${settings.currencySymbol}—`;
      item.tooltip = new vscode.MarkdownString(
        "未配置密钥。点击状态栏，在菜单中选择“安全输入 / 更新密钥”，保存后会自动刷新。"
      );
      item.tooltip.isTrusted = true;
      return;
    }

    const result = await fetchRelayBalance(settings);
    latestResult = result;

    if (lastBalance !== undefined && Math.abs(result.displayBalance - lastBalance) > 1e-6) {
      flashOnChange(item);
    }

    lastBalance = result.displayBalance;
    const icon = result.isValid ? "$(credit-card)" : "$(warning)";
    item.text = `${icon} ${settings.statusLabel} ${settings.currencySymbol}${result.displayBalance.toFixed(2)}`;
    item.tooltip = buildTooltip(result, settings);
    item.tooltip.isTrusted = true;
  } catch (err) {
    resetFlash(item);
    lastBalance = undefined;
    latestResult = undefined;
    item.text = `$(warning) ${settings.statusLabel} ${settings.currencySymbol}—`;
    const message = (err as Error)?.message ?? "未知错误";
    item.tooltip = new vscode.MarkdownString(`刷新失败：${message}`);
    item.tooltip.isTrusted = true;
  }
}

function formatMaybe(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return `${value.toFixed(2)}${suffix}`;
}

function buildTooltip(result: RelayBalanceResult, settings: ReturnType<typeof readRelaySettings>): vscode.MarkdownString {
  const statusText = result.isValid ? "可用" : `不可用（${result.invalidCode || "未知状态"}）`;
  const summaryLines: string[] = [
    "**Su8 Codes 余额概览**",
    `**当前总余额** ${settings.currencySymbol}${result.displayBalance.toFixed(2)} · ${statusText}`,
  ];

  if (result.todayLimit !== null) {
    summaryLines.push(`**今日基础额度** ${formatMaybe(result.todayLimit, ` ${result.unit}`)}`);
  }

  if (result.todayRemaining !== null) {
    summaryLines.push(`**今日剩余** ${formatMaybe(result.todayRemaining, ` ${result.unit}`)}`);
  }

  if (result.todayRemainingWithCarryover !== null) {
    summaryLines.push(`**含转结可用** ${formatMaybe(result.todayRemainingWithCarryover, ` ${result.unit}`)}`);
  }

  const hasSplitParts = result.balancePart !== undefined && result.planRemainingPart !== undefined;
  if (hasSplitParts) {
    summaryLines.push(`**余额组成** 套餐 ${formatMaybe(result.planRemainingPart, ` ${result.unit}`)} + 余额 ${formatMaybe(result.balancePart, ` ${result.unit}`)}`);
  } else if (result.mode === "quotaMinusUsed") {
    summaryLines.push(`**余额组成** 总配额 ${(result.quota ?? 0).toFixed(2)} - 已用 ${(result.used ?? 0).toFixed(2)}`);
  }

  const detailLines: string[] = [`刷新时间：${result.fetchedAt.toLocaleString()}`];

  if (result.subscriptions.length) {
    const topPlans = result.subscriptions
      .slice(0, 2)
      .map((sub) => {
        const name = sub.planName || sub.planId || "未知套餐";
        const amount = sub.remaining ?? sub.todayRemainingWithCarryover ?? sub.todayRemaining;
        return `${name} ${formatMaybe(amount, ` ${sub.unit}`)}`;
      })
      .join(" · ");
    detailLines.push(`套餐明细：${topPlans}`);
  }

  if (result.concurrencyPlan !== null || result.concurrencyBalance !== null) {
    detailLines.push(`并发：套餐 ${formatMaybe(result.concurrencyPlan)} · 余额 ${formatMaybe(result.concurrencyBalance)}`);
  }

  detailLines.push(`解析字段：\`${result.balancePath}\``);

  if (!result.isValid && result.invalidMessage) {
    detailLines.push(`提示：${result.invalidMessage}`);
  }

  detailLines.push(`[打开 Su8 Codes 官网](${SU8_SITE_URL})`);
  detailLines.push(`[打开余额接口地址](${result.url})`);

  return new vscode.MarkdownString(`${summaryLines.join("\n\n")}\n\n---\n\n${detailLines.join("\n\n")}`);
}

function describeBalancePath(balancePath: string): string {
  if (balancePath === "remaining" || balancePath === "data.remaining") {
    return "接口返回的总剩余额度";
  }

  if (balancePath === "balance + plan_remaining" || balancePath === "data.balance + data.plan_remaining") {
    return "余额字段与套餐剩余额度之和";
  }

  if (balancePath.includes(" - ")) {
    return "总配额减去已用额度";
  }

  return balancePath;
}

function flashOnChange(item: vscode.StatusBarItem) {
  resetFlash(item);
  item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  flashTimeout = setTimeout(() => {
    resetFlash(item);
  }, 600);
}

function resetFlash(item: vscode.StatusBarItem) {
  if (flashTimeout) {
    clearTimeout(flashTimeout);
    flashTimeout = undefined;
  }
  item.backgroundColor = undefined;
}
