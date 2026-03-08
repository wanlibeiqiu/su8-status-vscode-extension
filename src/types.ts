/**
 * 结构定义
 *
 * 兼容历史订阅结构（保留）+ 新的中转站余额扩展结构。
 */

export interface Subscription {
  resetTimes: number;
  id: number;
  employeeId: number;
  employeeName: string;
  employeeEmail: string;
  currentCredits: number;
  subscriptionPlanId: number;
  subscriptionPlanName: string;
  cost: number;
  startDate: Date;
  endDate: Date;
  billingCycle: string;
  billingCycleDesc: string;
  remainingDays: number;
  subscriptionStatus: string;
  subscriptionPlan: SubscriptionPlan;
  isActive: boolean;
  autoRenew: boolean;
  autoResetWhenZero: boolean;
  lastCreditReset: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionPlan {
  id: number;
  subscriptionName: string;
  billingCycle: string;
  cost: number;
  features: string;
  hotTag: string;
  tokenLimit: number;
  concurrencyLimit: number;
  rateLimitRequests: number;
  creditLimit: number;
  creditsPerHour: number;
  dailyCostLimit: number;
  enableModelRestriction: boolean;
  planType: string;
}

export type HttpMethod = "GET" | "POST";

export interface RelayBalanceSettings {
  baseUrl: string;
  balanceEndpoint: string;
  dashboardUrl: string;
  requestMethod: HttpMethod;
  apiKey: string;
  authHeader: string;
  authScheme: string;
  balancePath: string;
  quotaPath: string;
  usedPath: string;
  valueScale: number;
  timeoutMs: number;
  refreshIntervalSeconds: number;
  statusLabel: string;
  currencySymbol: string;
}

export type BalanceResolveMode = "direct" | "balancePlusPlan" | "quotaMinusUsed" | "noQuota";

export interface UsageSubscription {
  planId: string;
  planName: string | null;
  remaining: number | null;
  todayLimit: number | null;
  todayRemaining: number | null;
  todayRemainingWithCarryover: number | null;
  unit: string;
  isValid: boolean;
}

export interface RelayBalanceResult {
  url: string;
  rawBalance: number;
  displayBalance: number;
  balancePath: string;
  mode: BalanceResolveMode;
  isValid: boolean;
  invalidCode: string | null;
  invalidMessage: string | null;
  unit: string;
  planName: string;
  balancePart?: number;
  planRemainingPart?: number;
  todayLimit: number | null;
  todayRemaining: number | null;
  todayRemainingWithCarryover: number | null;
  subscriptions: UsageSubscription[];
  concurrencyPlan: number | null;
  concurrencyBalance: number | null;
  quota?: number;
  used?: number;
  fetchedAt: Date;
}
