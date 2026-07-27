# 安全基线

## 已实现控制

- JWT 仅由服务端签发，默认有效期 2 小时；管理员路由必须同时通过身份验证和 RBAC。
- API 默认不信任反向代理的 `X-Forwarded-*` 头；部署在可信代理后再明确配置可信地址。
- 使用 Helmet、安全响应头、精确 CORS Origin 允许列表和基于 IP 的速率限制。登录、范本提取和任务创建使用更低的路由限额。
- 生成请求有长度、数量和 schema 限制；队列有用户级与全局容量限制；幂等键减少重放造成的重复扣费/生成风险。
- 模型 API key、WeChat secret 和中转站地址仅存在环境变量，绝不由网页或小程序下发。
- 中转站 provider 必须为 HTTPS，且可用 `RELAY_ALLOWED_HOSTS` 限制为审核过的 host；用户输入不参与 URL 构造。
- DOCX 样式提取实施 ZIP-bomb、解压量、条目数和 XML DTD/entity 防护。
- Word 下载按任务所有者鉴权，文件路径不由请求参数决定。
- Worker 进程使用非 root 用户，Redis 不暴露宿主机端口，文档使用专用 Docker 卷。

## 上线前必须完成

1. 用 32 字节以上随机值替换 `JWT_SECRET`，不提交 `.env`。
2. 为 API 与 Web 使用独立 HTTPS 域名，并将 Web 精确填进 `CORS_ORIGINS` / `WEB_PUBLIC_URL`。
3. 使用托管 Secret 或容器 secret 注入模型 key、WeChat secret、Redis 密码和运维账户密码；Redis URL 中的特殊字符须 URL encode。
4. 密码登录仅是小型运维账户入口。生产环境要么设置四个非默认 `DEMO_*` 值并显式启用 `DEMO_AUTH_ENABLED=true`，要么关闭它，仅走已配置的微信身份链路；大规模用户必须接入持久化身份服务、密码哈希和账号恢复流程。
5. 反向代理配置请求体上限、WAF、TLS、访问日志和 API 速率策略；若 API 被代理，按实际代理 IP 配置 `trustProxy`。
6. 备份 Redis AOF 和文档卷，监控 Worker 的 `job.failed`、`job.stalled` 和队列积压。
7. 对 AI 输出做内容审核、敏感信息处理和人工发布责任控制；不要把生成结果当作事实或学术诚信证明。

## 依赖审计说明

`pnpm audit --prod` 当前为 0 critical / 0 high。剩余 7 个 moderate 与 2 个 low 均来自 Taro 4.2.1 固定的 Webpack 5.91 / webpack-dev-server 4 构建链，主要影响本地 H5 dev server 或未使用的 Webpack HTTP 构建能力；本项目生产交付的是微信小程序静态包，不公开该 dev server。直接把 Webpack 跨版本覆盖到修复版会破坏 Taro 官方 runner 的 ProgressPlugin 契约，已通过构建验证确认不兼容；后续随 Taro 官方版本升级消除。`fast-jwt`、`swiper`、`brace-expansion`、`esbuild` 和 `uuid` 的 critical/high 已升级或工作区锁定到修复版。

## 轮换与响应

- 怀疑模型 key 泄露：先在 provider 侧吊销，再更新 Secret、滚动 Worker/API、检查使用日志。
- JWT Secret 轮换会使已有会话失效；在维护窗口执行并提醒用户重新登录。
- Redis 密码轮换：停止 Worker 投递、备份 AOF，依次更新 Redis/API/Worker Secret 并恢复。
- 发现恶意范本或异常请求：保存 request ID 与哈希，不保存不必要的论文正文；按 WAF/日志规则封禁并调整阈值。
