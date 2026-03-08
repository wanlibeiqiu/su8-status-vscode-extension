# Su8 Codes 余额（VS Code 扩展）

一个轻量扩展，在 VS Code 右下角状态栏显示 **Su8 Codes** 中转站余额。

- 官网：`https://www.su8.codes`
- 固定接口基地址：`https://www.su8.codes/codex/v1`
- 文档口径：`GET /codex/v1/usage`

## 功能

- 状态栏显示余额：`$(credit-card) 余额 $<value>`
- 余额变化时短暂闪烁
- 不可用状态（如 `NO_QUOTA`）会显示警告图标
- Tooltip 展示：
  - 总余额口径
  - 当前总余额 / 今日基础额度 / 今日剩余 / 含转结可用
  - 套餐拆分（前 3 条）
  - 并发信息（`concurrency.plan` / `concurrency.balance`）
- 点击状态栏可：
  - 通过安全输入框粘贴 / 更新密钥
  - 回车安全保存密钥并立即刷新余额
  - 清除已保存密钥（回退到环境变量）
  - 刷新余额
  - 复制当前余额
  - 打开 Su8 官网
  - 打开接口地址
  - （可选）打开控制台地址

## 默认请求（已按 SU8 文档）

- 地址：`https://www.su8.codes/codex/v1/usage`
- 方法：`GET`
- 默认认证头：`Authorization: Bearer <API_KEY>`
- 默认余额字段：`remaining`

认证头也支持改为 `x-api-key`（在设置中把 `relayBalance.authHeader` 改成 `x-api-key`，并把 `relayBalance.authScheme` 置空）。

## 余额解析规则

1. 先读 `relayBalance.balancePath`（默认 `remaining`）
2. 其次尝试 `balance + plan_remaining`
3. 再尝试 `quota - used`（兼容其他网关）
4. 若 `invalidCode = NO_QUOTA`，余额按 `0` 展示并标记不可用

## 配置

在 VS Code 设置中搜索 `relayBalance`。

常用项：

- `密钥`：不再通过 `relayBalance.apiKey` 配置；请点击状态栏，在菜单中选择“安全输入 / 更新密钥”，扩展会保存到 VS Code 安全存储
- `relayBalance.balanceEndpoint`：接口路径（默认 `/usage`）
- `relayBalance.authHeader`：默认 `Authorization`，也可 `x-api-key`
- `relayBalance.authScheme`：默认 `Bearer`，用 `x-api-key` 时建议留空
- `relayBalance.balancePath`：余额路径（默认 `remaining`）
- `relayBalance.quotaPath`、`relayBalance.usedPath`：兜底解析
- `relayBalance.valueScale`：显示换算系数
- `relayBalance.refreshIntervalSeconds`：自动刷新周期
- `relayBalance.dashboardUrl`：菜单里“打开控制台”地址（可选）

## 密钥读取优先级

1. 菜单中的安全输入保存到安全存储的密钥
2. 环境变量：`RELAY_BALANCE_API_KEY`、`OPENAI_API_KEY`、`ANTHROPIC_AUTH_TOKEN`

首次启动时，如果检测到旧的 `relayBalance.apiKey` 配置，扩展会自动迁移到安全存储，并清空旧配置。

## 开发

```bash
pnpm install
pnpm run compile
pnpm run lint
```

打包：

```bash
pnpm run package
```
