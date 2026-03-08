import * as assert from "assert";
import { buildBalanceRequestUrl, resolveBalanceFromPayload } from "../api";
import type { RelayBalanceSettings } from "../types";

function makeSettings(partial: Partial<RelayBalanceSettings> = {}): RelayBalanceSettings {
  return {
    baseUrl: "https://www.su8.codes/codex/v1",
    balanceEndpoint: "/usage",
    dashboardUrl: "",
    requestMethod: "GET",
    apiKey: "su8-test",
    authHeader: "Authorization",
    authScheme: "Bearer",
    balancePath: "remaining",
    quotaPath: "data.quota",
    usedPath: "data.used_quota",
    valueScale: 1,
    timeoutMs: 8000,
    refreshIntervalSeconds: 60,
    statusLabel: "余额",
    currencySymbol: "$",
    ...partial,
  };
}

suite("api helpers", () => {
  test("buildBalanceRequestUrl joins base and endpoint", () => {
    const url = buildBalanceRequestUrl(makeSettings());
    assert.strictEqual(url, "https://www.su8.codes/codex/v1/usage");
  });

  test("resolveBalanceFromPayload parses SU8 usage payload", () => {
    const result = resolveBalanceFromPayload(
      {
        isValid: true,
        invalidCode: null,
        invalidMessage: null,
        planName: "套餐+余额",
        remaining: 15,
        unit: "USD",
        balance: 5,
        plan_remaining: 10,
        todayLimit: 10,
        todayRemaining: 9,
        todayRemainingWithCarryover: 9,
        subscriptions: [
          {
            planId: "plan_xxx",
            planName: "Smoke Plan",
            remaining: 10,
            todayLimit: 10,
            todayRemaining: 9,
            todayRemainingWithCarryover: 9,
            unit: "USD",
            isValid: true,
          },
        ],
        concurrency: {
          plan: 3,
          balance: 50,
        },
      },
      makeSettings()
    );

    assert.strictEqual(result.mode, "direct");
    assert.strictEqual(result.rawBalance, 15);
    assert.strictEqual(result.balancePath, "remaining");
    assert.strictEqual(result.unit, "USD");
    assert.strictEqual(result.planName, "套餐+余额");
    assert.strictEqual(result.todayLimit, 10);
    assert.strictEqual(result.subscriptions.length, 1);
    assert.strictEqual(result.concurrencyPlan, 3);
    assert.strictEqual(result.isValid, true);
  });

  test("resolveBalanceFromPayload falls back to balance + plan_remaining", () => {
    const result = resolveBalanceFromPayload(
      {
        isValid: true,
        balance: 5,
        plan_remaining: 10,
      },
      makeSettings({ balancePath: "" })
    );

    assert.strictEqual(result.mode, "balancePlusPlan");
    assert.strictEqual(result.rawBalance, 15);
    assert.strictEqual(result.displayBalance, 15);
    assert.strictEqual(result.balancePath, "balance + plan_remaining");
  });

  test("resolveBalanceFromPayload keeps split parts when remaining equals balance plus plan_remaining", () => {
    const result = resolveBalanceFromPayload(
      {
        isValid: true,
        remaining: 15,
        balance: 5,
        plan_remaining: 10,
      },
      makeSettings()
    );

    assert.strictEqual(result.mode, "direct");
    assert.strictEqual(result.rawBalance, 15);
    assert.strictEqual(result.balancePart, 5);
    assert.strictEqual(result.planRemainingPart, 10);
  });

  test("resolveBalanceFromPayload maps NO_QUOTA to zero balance", () => {
    const result = resolveBalanceFromPayload(
      {
        isValid: false,
        invalidCode: "NO_QUOTA",
        invalidMessage: "No available quota",
      },
      makeSettings({ balancePath: "" })
    );

    assert.strictEqual(result.mode, "noQuota");
    assert.strictEqual(result.rawBalance, 0);
    assert.strictEqual(result.displayBalance, 0);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.invalidCode, "NO_QUOTA");
  });

  test("resolveBalanceFromPayload falls back to quota-used and scale", () => {
    const result = resolveBalanceFromPayload(
      {
        data: {
          quota: 500000,
          used_quota: 250000,
        },
      },
      makeSettings({
        balancePath: "",
        valueScale: 0.000002,
      })
    );

    assert.strictEqual(result.mode, "quotaMinusUsed");
    assert.strictEqual(result.rawBalance, 250000);
    assert.strictEqual(result.displayBalance, 0.5);
  });
});
