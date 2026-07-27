# 文核微信小程序

基于 Taro 4、React 18 和 TypeScript 的独立微信小程序用户端。它只包含用户写作流程，不包含管理员页面、管理员路由或管理员入口。

## 已实现

- 首页：生成服务状态、最近任务、充值/查重占位与二手书跳转入口
- 新建文章：主题、用途、篇幅、提纲、格式要求、DOCX 范本和生成线路
- 生成线路：智能路由、DeepSeek 直连、兼容中转站
- 任务：全部/生成中/已完成/失败筛选、详情轮询、Word 下载与微信内打开
- 我的：微信登录、余额与已完成数量、退出登录
- 充值和查重：仅展示明确的未接入状态，不创建支付订单、不上传论文、不执行查重

## 本地运行

```powershell
cd C:\Users\27719\Documents\论文网站\apps\miniapp
pnpm install --ignore-workspace --lockfile=false --ignore-scripts
$env:TARO_APP_ENABLE_DEMO_MODE='true'
pnpm run dev:weapp
```

用微信开发者工具导入本目录。`project.config.json` 的小程序根目录是 `dist/`；开发前将其中的 `appid` 替换为实际的小程序 AppID，或在开发者工具中选择测试号。

生产构建：

```powershell
$env:TARO_APP_API_BASE_URL='https://api.your-domain.com'
$env:TARO_APP_BOOKSTORE_WEB_URL='https://books.your-domain.com'
$env:TARO_APP_ENABLE_DEMO_MODE='false'
pnpm run typecheck
pnpm run build:weapp
```

## 环境变量与部署

| 变量 | 作用与约束 |
| --- | --- |
| `TARO_APP_API_BASE_URL` | API **源站地址**，例如 `https://api.your-domain.com`；不要附加 `/v1`，小程序会自行追加 `/v1/*`。小程序默认值为 `http://127.0.0.1:8787`，而 API 服务默认端口是 `3100`，本地联调必须显式设置其中一侧。 |
| `TARO_APP_BOOKSTORE_MINIAPP_APPID` | 二手书独立小程序 AppID；非空时调用 `navigateToMiniProgram`。 |
| `TARO_APP_BOOKSTORE_WEB_URL` | 二手书网页版入口；只有 AppID 为空时才由小程序 `WebView` 打开。必须是已配置的 HTTPS 业务域名。 |
| `TARO_APP_ENABLE_DEMO_MODE` | `true` 时所有登录、模板、任务和下载都使用本地演示数据；正式环境必须为 `false`。 |

API 服务的正式部署还必须满足以下条件：

1. 设置 `JWT_SECRET` 为至少 32 个字符的非开发密钥；API 在生产模式会拒绝短密钥或默认开发密钥。
2. 设置 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`。缺少其中任一个时，`POST /v1/auth/wechat` 返回 `503 WECHAT_AUTH_NOT_CONFIGURED`。
3. 设置 `AI_MOCK_MODE=false`，并配置可用的 DeepSeek/兼容中转站 provider。服务端只保存模型密钥，小程序不得持有模型密钥。
4. 设置 `HOST`、`PORT`、`OUTPUT_DIR`、`CORS_ORIGINS` 和 `AI_MAX_CONCURRENCY`；后者由服务端限制在 `1` 到 `10`。`CORS_ORIGINS` 主要影响 H5 调用，微信小程序仍必须在公众平台配置合法域名。
5. 生产环境应设置 `REDIS_URL` 和 `GENERATION_QUEUE_NAME`。未设置 `REDIS_URL` 时 API 使用进程内队列；设置后使用 BullMQ/Redis 队列。
6. 在微信公众平台为 API 配置 `request`、`uploadFile`、`downloadFile` 合法域名，并为二手书 H5 配置业务域名。所有正式地址均使用 HTTPS。

## API 契约

小程序 API 路径集中在 `src/services/api.ts`。当前 `apps/api/src/app.ts` 返回原始 JSON，不包装为 `{ "data": ... }`；小程序 client 同时兼容这种原始响应和 `{ "data": ... }` 包装响应。

除登录接口外，以下请求都发送 `Authorization: Bearer <token>`。用户任务接口只返回当前 token 所属用户的数据。

| 方法 | 路径 | 小程序实际用途 | 服务端响应 |
| --- | --- | --- | --- |
| `POST` | `/v1/auth/wechat` | 以 `wx.login()` 的 `code` 换取登录会话 | `{ token, user, expiresInSeconds }` |
| `GET` | `/v1/me` | 读取当前用户、余额和完成数量 | `{ id, nickname, balance, generatedCount }` |
| `GET` | `/v1/providers` | API 支持的 provider 清单；当前小程序不直接调用，使用固定的三项选择 | `{ providers }` |
| `POST multipart` | `/v1/templates/extract` | 上传并提取 DOCX 格式范本 | `{ template: { fileName, profile, suggestedStyle } }` |
| `POST` | `/v1/generations` | 创建文章生成任务 | `202 { job }` |
| `GET` | `/v1/generations` | 获取当前用户任务列表 | `{ jobs }` |
| `GET` | `/v1/generations/:id` | 查询单个任务 | `{ job }` |
| `GET` | `/v1/generations/:id/download` | 下载已完成 DOCX | 原始 `.docx` 二进制流 |

`/v1/templates/extract` 使用 `multipart/form-data`，小程序文件字段名为 `template`。小程序端限制为 DOCX、最大 10MB；API 服务端只接受 DOCX ZIP 签名，最大 20MB。当前小程序上传范本后只显示返回的 `fileName`，不会把 `profile`、`suggestedStyle`、`styleHints` 或 `pageHints` 写入生成请求；生成格式目前来自表单中的文字格式要求。

### 微信登录

请求体：

```json
{ "code": "wx.login 返回的临时 code" }
```

`code` 必须为 6 到 256 个字符。token 有效期由 API 签发，目前为 7,200 秒。

### 创建任务 JSON

创建任务必须携带客户端生成的 `Idempotency-Key` header。API 只接受 8 到 128 个字符，且只能包含字母、数字、`.`、`_`、`:`、`-`；小程序已自动生成该 header。

小程序实际发送的 JSON 是：

```json
{
  "topic": "数字经济背景下的企业管理创新",
  "requirements": "用途：课程论文\n一级标题黑体三号，正文宋体小四，1.5 倍行距",
  "providerId": "smart",
  "outline": ["研究背景", "理论基础", "案例分析"],
  "targetCharacters": 5000
}
```

字段来源和限制：

| 字段 | 小程序来源 | API 限制 |
| --- | --- | --- |
| `topic` | 文章主题 | 2 至 300 字符 |
| `requirements` | `用途：${purpose}` 与格式要求，以换行拼接 | 2 至 20,000 字符 |
| `providerId` | `smart`、`deepseek`、`relay` 三选一 | API 还接受 `mock`；完整枚举为 `smart`、`mock`、`deepseek`、`relay` |
| `outline` | 提纲按换行或中文逗号拆分 | 可选，最多 20 项，每项 1 至 300 字符 |
| `targetCharacters` | 目标篇幅 | 可选整数，500 至 100,000 |

API 还允许可选的 `author`、`institution`、`styleHints` 和 `pageHints`，但当前小程序不会发送这些字段。`subject`、`purpose`、`targetWords`、`formatInstructions`、`templateAssetId` 和 `templateName` 是小程序内部表单状态；其中只有前四项会被转换为上述 `/v1/generations` HTTP 字段，后两项当前不会发送给 API。

### 任务状态映射

服务端 job 状态与小程序 UI 状态并不相同。小程序的 `mapApiJob` 映射如下：

| API job.status | 小程序 task.status | 页面文案 |
| --- | --- | --- |
| `queued` | `queued` | 任务已进入生成队列 |
| `running` | `generating` | 正在生成并排版 |
| `succeeded` | `completed` | Word 文档已生成 |
| `failed` | `failed` | 生成失败 |

API job 的核心字段是 `id`、`topic`、`providerId`、`status`、`progress`、`createdAt`、`updatedAt` 和可选 `error`。小程序在 `succeeded` 时根据 API 源站和 job id 组装下载地址；不要求 job JSON 返回 `documentUrl`。

## 发布检查

1. 关闭 `TARO_APP_ENABLE_DEMO_MODE`，将 API 源站、二手书 AppID 或 H5 地址替换为正式 HTTPS 地址。
2. 配置微信登录密钥、JWT 密钥、AI provider 和生产队列；先调用 `/health`，再测试微信登录。
3. 验证携带 Bearer token 与 `Idempotency-Key` 后的模板提取、创建任务、轮询和 DOCX 下载。
4. 对登录、模板上传和任务创建保留服务端速率限制；API 已分别限制为每分钟 20、6、12 次，队列还限制每用户最多 5 个开放任务。
5. 在真实设备测试 DOCX 选择、上传、任务后台继续执行、下载和 `openDocument`，并检查请求/上传/下载/业务域名白名单。
