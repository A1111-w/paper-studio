# 文核写作台

面向文章和论文初稿的独立写作平台：用户提交主题、提纲、格式要求或 DOCX 范本，服务端调用 DeepSeek 或经审核的 OpenAI-compatible 中转站生成结构化内容，再由受控 Word 工具渲染为 `.docx`。

这不是查重产品。查重和充值都保留为关闭态占位，未上传论文、未调用外部检测/支付服务，也没有伪造任何结果。

## 项目边界

- 网页端：React + Vite 写作台、任务列表、格式范本、管理员总览。
- 小程序端：Taro + React 微信用户端，位于 `apps/miniapp`，不包含管理员模式。
- API：Fastify、JWT、RBAC、请求限流、格式范本安全提取和任务 API。
- Worker：BullMQ + Redis 长任务消费者；开发时可切换为受并发限制的内联队列。
- 文档工具：模型只能提交经 Zod 校验的结构化 `DocumentSpec`，`@wenhe/document` 决定中文字体、标题层级、页码、页眉页脚、表格和分页，模型不直接拼 OOXML。

二手书项目是独立仓库、独立部署和独立账号体系。网页端通过 `VITE_BOOK_SITE_URL` 跳转；小程序通过 `TARO_APP_BOOKSTORE_*` 跳转。

## 快速启动

需要 Node.js 20+ 与 pnpm 11+。

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

打开 `http://127.0.0.1:5173`。默认开发账户为 `writer@local.test` / `writer-demo-password`；管理员为 `admin@local.test` / `admin-demo-password`。这些账户仅用于本地演示，生产部署必须替换或关闭密码登录。

常用验证：

```powershell
pnpm build:all
pnpm test:all
pnpm build
pnpm --filter @wenhe/miniapp typecheck
$env:TARO_APP_ENABLE_DEMO_MODE='true'; pnpm --filter @wenhe/miniapp build:weapp
```

## AI 配置

保持 `AI_MOCK_MODE=true` 可完成本地端到端演示，不会访问模型服务。要启用真实生成，将其改为 `false`，并至少配置一个 provider：

```dotenv
DEEPSEEK_API_KEY=your-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# 可选：经运营审核的 OpenAI-compatible 中转站
RELAY_API_KEY=your-key
RELAY_BASE_URL=https://relay.example.com/v1
RELAY_MODEL=provider-model
RELAY_ALLOWED_HOSTS=relay.example.com
```

中转站地址只能由运维环境变量配置，用户提交的请求不能决定目标 URL。详细配置和运维方式见 [docs/operations.md](docs/operations.md)。

## 部署

生产模式使用 Redis 和独立 Worker：

```powershell
Copy-Item .env.example .env
# 编辑 .env，设置 JWT_SECRET、REDIS_PASSWORD、Web/API 公网地址与模型密钥
docker compose up --build -d
```

- Web：`http://localhost:8080`
- API：`http://localhost:3100/health`
- Redis 不对宿主机暴露端口。

API 与 Worker 通过 `paper_documents` 卷共享生成的 Word 文件。设置 `REDIS_URL` 后 API 不再执行生成任务，必须同时运行 Worker；不设置时仅用于本地开发的内联模式。

## 维护文档

- [架构与数据流](docs/architecture.md)
- [安全基线](docs/security.md)
- [运维与发布](docs/operations.md)
- [小程序接入说明](apps/miniapp/README.md)

## 已知边界

- 当前密码账户是环境变量中的小型运维账户；面向正式用户的账户、余额账本、订单与支付回调需在支付方案确定后接入持久化身份/账本服务。
- 查重模块完全关闭，待你提供正式查重服务的请求与报告契约后才接入。
- DOCX 已经过结构化 OOXML 测试；当前机器未安装 LibreOffice，未进行渲染为图片的视觉对照测试。
