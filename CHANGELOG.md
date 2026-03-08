# Change Log

## v0.4.1

- 点击状态栏菜单后，可通过安全输入框粘贴 / 更新 Su8 密钥
- 密钥改为保存到 VS Code 安全存储，不再要求在 `relayBalance.apiKey` 中配置
- 自动迁移旧版 `relayBalance.apiKey` 到安全存储
- 菜单新增清除已保存密钥的能力，并在清除后回退到环境变量

## v0.4.0

重构为 Su8 Codes 余额查询扩展：

- 内置固定接口基地址：`https://www.su8.codes/codex/v1`
- 默认对接 `GET /usage` 并解析 `remaining / balance + plan_remaining`
- 状态栏显示 Su8 余额，支持复制余额、打开官网 / 接口地址
- Tooltip 展示今日额度、套餐拆分、并发信息
- 保留自动刷新与手动刷新

## v0.2.1

新增功能：可通过菜单重置某个套餐的额度。

## v0.2.0

新增功能：点击状态栏会显示菜单。

## v0.1.0

初版，可在右下角状态栏查看总余量，悬浮显示各套餐信息。
