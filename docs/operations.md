# 运维与发布

## 开发模式

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

未设置 `REDIS_URL` 时 API 使用内联队列，适合本地调试；进程重启会丢失任务状态。保持 `AI_MOCK_MODE=true` 可以验证从登录、任务创建到 DOCX 下载的全链路而不消耗模型额度。

独立运行：

```powershell
pnpm --filter @wenhe/api dev
pnpm dev:client
pnpm --filter @wenhe/miniapp typecheck
$env:TARO_APP_ENABLE_DEMO_MODE='true'; pnpm --filter @wenhe/miniapp build:weapp
```

## 生产环境变量

| 变量 | 用途 |
| --- | --- |
| `JWT_SECRET` | 至少 32 个字符的服务端 JWT 密钥 |
| `REDIS_PASSWORD` | Docker Compose Redis 密码；特殊字符应 URL encode 后再用于独立 `REDIS_URL` |
| `VITE_API_BASE_URL` | 构建时写入网页的 API 源站，例如 `https://api.example.com` |
| `WEB_PUBLIC_URL` | 网页公网地址，用于 API CORS，例如 `https://write.example.com` |
| `AI_MOCK_MODE` | 生产设为 `false` |
| `DEEPSEEK_*` | DeepSeek OpenAI-compatible 配置 |
| `RELAY_*` | 可选中转站配置，必须设置审核 host 白名单 |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 小程序 code 换取会话所需密钥 |
| `DEMO_AUTH_ENABLED` | 是否启用 Web 运维账户；生产默认关闭 |

`DATABASE_URL`、`S3_*` 未被当前版本使用，不能因为出现在旧部署模板中而配置为“已接入”。

## Compose 部署

```powershell
Copy-Item .env.example .env
# 填写至少 JWT_SECRET、REDIS_PASSWORD、VITE_API_BASE_URL、WEB_PUBLIC_URL、AI provider
docker compose config
docker compose up --build -d
docker compose ps
docker compose logs -f api worker
```

检查：

```powershell
Invoke-WebRequest http://127.0.0.1:3100/health
docker compose exec redis redis-cli -a $env:REDIS_PASSWORD ping
```

部署时 `REDIS_URL` 存在，务必同时运行 `worker`。Worker 不启动时任务会处于 `queued`，这是预期的保护行为，不是 API 失败。

## 小程序发布

1. 配置 `TARO_APP_API_BASE_URL` 为 API 源站，不带 `/v1`；配置二手书 AppID 或 HTTPS WebView 地址。
2. 在微信公众平台登记 `request`、`uploadFile`、`downloadFile` 合法域名和 WebView 业务域名。
3. 设置 `TARO_APP_ENABLE_DEMO_MODE=false`，构建 `pnpm --filter @wenhe/miniapp build:weapp`。
4. 用微信开发者工具导入 `apps/miniapp`，替换测试 AppID，检查登录、上传、下载和跳转。

## 备份与恢复

- Redis：定期导出 AOF/RDB；仅恢复到隔离环境后验证队列状态。
- Word 文档：备份 `paper_documents` 卷，并加密后离线保存。
- 恢复顺序：Redis -> API/Worker -> 文档卷；若文档丢失但 Redis job 标记已完成，下载接口会返回 `OUTPUT_NOT_FOUND`，应人工重试生成或标记失败。

## 验证清单

```powershell
pnpm build:all
pnpm test:all
pnpm build
pnpm --filter @wenhe/miniapp typecheck
```

真实 provider 验收前，先使用 Mock 验证任务、队列并发、失败重试与下载权限；再使用低额度、无敏感信息的测试主题验证 DeepSeek/中转站。
