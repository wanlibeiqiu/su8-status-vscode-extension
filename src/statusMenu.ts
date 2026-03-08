import * as vscode from "vscode";
import { buildBalanceRequestUrl } from "./api";
import { readRelaySettings, SU8_CODEX_BASE_URL, SU8_SITE_URL } from "./config";
import type { RelayBalanceResult } from "./types";

type ActionId = "promptApiKey" | "clearApiKey" | "refresh" | "copyBalance" | "openSite" | "openDashboard" | "openApi";

interface ActionMenuItem extends vscode.QuickPickItem {
  itemType: "action";
  action: ActionId;
  alwaysShow: true;
}

export interface StatusMenuDeps {
  refreshStatus: (item: vscode.StatusBarItem) => Promise<void>;
  getLatestResult: () => RelayBalanceResult | undefined;
  getStoredApiKey: () => Promise<string>;
  setStoredApiKey: (value: string) => Promise<void>;
  getEnvApiKey: () => string;
}

export async function showStatusMenu(item: vscode.StatusBarItem, deps: StatusMenuDeps) {
  const latest = deps.getLatestResult();
  const storedApiKey = await deps.getStoredApiKey();
  const envApiKey = deps.getEnvApiKey();
  const settings = readRelaySettings(storedApiKey || envApiKey);

  const quickPick = vscode.window.createQuickPick<ActionMenuItem>();
  quickPick.title = "Su8 Codes 余额操作";
  quickPick.ignoreFocusOut = true;
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;
  quickPick.placeholder = "选择操作；如需修改密钥，请选择“安全输入 / 更新密钥”";
  quickPick.items = buildItems({ latest, storedApiKey, envApiKey, settings });

  const disposables: vscode.Disposable[] = [];

  return await new Promise<void>((resolve) => {
    let didFinish = false;
    let actionTriggered = false;

    const finish = () => {
      if (didFinish) {
        return;
      }
      didFinish = true;
      while (disposables.length) {
        disposables.pop()?.dispose();
      }
      quickPick.dispose();
      resolve();
    };

    disposables.push(
      quickPick.onDidHide(() => {
        if (!actionTriggered) {
          finish();
        }
      }),
      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems[0] ?? quickPick.activeItems[0];
        if (!selected) {
          return;
        }

        actionTriggered = true;
        quickPick.busy = true;
        quickPick.hide();

        try {
          await handleActionItem(selected.action, item, deps, storedApiKey, envApiKey);
        } finally {
          finish();
        }
      })
    );

    quickPick.show();
  });
}

function buildItems({
  latest,
  storedApiKey,
  envApiKey,
  settings,
}: {
  latest: RelayBalanceResult | undefined;
  storedApiKey: string;
  envApiKey: string;
  settings: ReturnType<typeof readRelaySettings>;
}): ActionMenuItem[] {
  const items: ActionMenuItem[] = [
    {
      label: "$(lock) 安全输入 / 更新密钥",
      description: storedApiKey
        ? `已保存：${maskApiKey(storedApiKey)}`
        : envApiKey
          ? `当前使用环境变量：${maskApiKey(envApiKey)}`
          : "未配置密钥",
      detail: "打开密码输入框，不会在菜单中明文显示密钥。",
      itemType: "action",
      action: "promptApiKey",
      alwaysShow: true,
    },
  ];

  if (storedApiKey) {
    items.push({
      label: "$(trash) 清除已保存的密钥",
      description: `当前已保存：${maskApiKey(storedApiKey)}`,
      detail: envApiKey
        ? "清除后会回退到环境变量中的密钥。"
        : "清除后余额会显示为未配置，直到重新输入或提供环境变量。",
      itemType: "action",
      action: "clearApiKey",
      alwaysShow: true,
    });
  }

  if (latest) {
    items.push({
      label: `$(clippy) 复制当前余额 ${latest.displayBalance.toFixed(2)}`,
      description: "复制到剪贴板",
      itemType: "action",
      action: "copyBalance",
      alwaysShow: true,
    });
  }

  items.push(
    {
      label: "$(refresh) 刷新余额",
      description: "立即请求 Su8 Codes 余额接口数据",
      itemType: "action",
      action: "refresh",
      alwaysShow: true,
    },
    {
      label: "$(link-external) 打开 Su8 Codes 官网",
      itemType: "action",
      action: "openSite",
      alwaysShow: true,
    },
    {
      label: "$(link-external) 打开接口地址",
      description: latest?.url || buildBalanceRequestUrl(settings),
      itemType: "action",
      action: "openApi",
      alwaysShow: true,
    }
  );

  if (settings.dashboardUrl) {
    items.push({
      label: "$(dashboard) 打开控制台",
      description: settings.dashboardUrl,
      itemType: "action",
      action: "openDashboard",
      alwaysShow: true,
    });
  }

  return items;
}

function maskApiKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "未配置";
  }

  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}***`;
  }

  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

async function promptForApiKey(storedApiKey: string, envApiKey: string): Promise<string | undefined> {
  const prompt = storedApiKey
    ? `当前已保存：${maskApiKey(storedApiKey)}`
    : envApiKey
      ? `当前使用环境变量：${maskApiKey(envApiKey)}`
      : "请输入 Su8 Codes 密钥";

  const value = await vscode.window.showInputBox({
    title: storedApiKey ? "更新 Su8 Codes 密钥" : "配置 Su8 Codes 密钥",
    prompt,
    placeHolder: "粘贴密钥后按回车保存；按 Esc 取消",
    password: true,
    ignoreFocusOut: true,
    validateInput: (input) => {
      if (!input.trim()) {
        return "密钥不能为空。";
      }
      return undefined;
    },
  });

  return value?.trim();
}

async function handleActionItem(
  action: ActionId,
  item: vscode.StatusBarItem,
  deps: StatusMenuDeps,
  storedApiKey: string,
  envApiKey: string
) {
  if (action === "promptApiKey") {
    const nextApiKey = await promptForApiKey(storedApiKey, envApiKey);
    if (!nextApiKey) {
      return;
    }

    await deps.setStoredApiKey(nextApiKey);
    vscode.window.showInformationMessage("Su8 Codes 密钥已安全保存，正在刷新余额…");
    await deps.refreshStatus(item);
    return;
  }

  if (action === "clearApiKey") {
    await deps.setStoredApiKey("");
    vscode.window.showInformationMessage(
      envApiKey ? "已清除已保存密钥，现回退使用环境变量。" : "已清除已保存密钥。"
    );
    await deps.refreshStatus(item);
    return;
  }

  if (action === "refresh") {
    await deps.refreshStatus(item);
    return;
  }

  if (action === "copyBalance") {
    const latest = deps.getLatestResult();
    if (!latest) {
      vscode.window.showWarningMessage("当前没有可复制的余额，请先刷新。");
      return;
    }
    await vscode.env.clipboard.writeText(latest.displayBalance.toFixed(2));
    vscode.window.showInformationMessage(`已复制余额：${latest.displayBalance.toFixed(2)}`);
    return;
  }

  if (action === "openSite") {
    await vscode.env.openExternal(vscode.Uri.parse(SU8_SITE_URL));
    return;
  }

  if (action === "openDashboard") {
    const currentSettings = readRelaySettings(storedApiKey || envApiKey);
    if (!currentSettings.dashboardUrl) {
      vscode.window.showWarningMessage("未配置 dashboardUrl。",
      );
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(currentSettings.dashboardUrl));
    return;
  }

  if (action === "openApi") {
    const latest = deps.getLatestResult();
    if (latest?.url) {
      await vscode.env.openExternal(vscode.Uri.parse(latest.url));
      return;
    }

    const currentSettings = readRelaySettings(storedApiKey || envApiKey);
    const url = currentSettings.balanceEndpoint ? buildBalanceRequestUrl(currentSettings) : SU8_CODEX_BASE_URL;
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }
}
