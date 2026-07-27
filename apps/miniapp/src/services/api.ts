import Taro from '@tarojs/taro'
import { getToken, readDemoData, setToken, writeDemoData } from './storage'

export type ProviderId = 'smart' | 'deepseek' | 'relay'
export type TaskStatus = 'queued' | 'generating' | 'completed' | 'failed'

export interface ArticleDraft {
  subject: string
  purpose: string
  targetWords: number
  formatInstructions: string
  outline?: string
  provider: ProviderId
  templateAssetId?: string
  templateName?: string
}

export interface ArticleTask {
  id: string
  subject: string
  purpose: string
  targetWords: number
  provider: ProviderId
  providerLabel: string
  status: TaskStatus
  progress: number
  statusMessage: string
  createdAt: string
  updatedAt: string
  templateName?: string
  documentUrl?: string
  errorMessage?: string
}

export interface UserProfile {
  id: string
  nickname: string
  mobileMasked?: string
  balance: number
  generatedCount: number
}

interface ApiEnvelope<T> {
  data: T
  message?: string
}

const ENDPOINTS = {
  login: '/v1/auth/wechat',
  me: '/v1/me',
  templates: '/v1/templates/extract',
  articles: '/v1/generations',
  article: (id: string) => `/v1/generations/${encodeURIComponent(id)}`,
  download: (id: string) => `/v1/generations/${encodeURIComponent(id)}/download`
}

const providerLabels: Record<ProviderId, string> = {
  smart: '智能路由',
  deepseek: 'DeepSeek 直连',
  relay: '兼容中转站'
}

function apiUrl(path: string) {
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`
}

type RequestOptions = Omit<Taro.request.Option, 'url'>

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken()
  const response = await Taro.request<ApiEnvelope<T> | T>({
    timeout: 20000,
    ...options,
    url: apiUrl(path),
    header: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.header
    }
  })

  if (response.statusCode === 401) {
    throw new Error('登录状态已失效，请在“我的”页面重新登录')
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const body = response.data as ApiEnvelope<T>
    throw new Error(body?.message || (body as { error?: string })?.error || `服务请求失败（${response.statusCode}）`)
  }

  const body = response.data as ApiEnvelope<T>
  return body && typeof body === 'object' && 'data' in body ? body.data : response.data as T
}

function demoSeed(): ArticleTask[] {
  return [
    {
      id: 'demo-completed',
      subject: '数字化转型背景下企业财务管理创新研究',
      purpose: '课程论文',
      targetWords: 5000,
      provider: 'deepseek',
      providerLabel: providerLabels.deepseek,
      status: 'completed',
      progress: 100,
      statusMessage: 'Word 文档已生成',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 85400000).toISOString(),
      templateName: '课程论文格式.docx',
      documentUrl: 'demo://document'
    }
  ]
}

function demoTasks() {
  const current = readDemoData<ArticleTask[]>([])
  if (current.length) return current
  const seed = demoSeed()
  writeDemoData(seed)
  return seed
}

function evolveDemoTask(task: ArticleTask): ArticleTask {
  if (task.status === 'completed' || task.status === 'failed') return task
  const elapsed = Date.now() - new Date(task.createdAt).getTime()
  if (elapsed >= 14000) {
    return { ...task, status: 'completed', progress: 100, statusMessage: 'Word 文档已生成', documentUrl: 'demo://document', updatedAt: new Date().toISOString() }
  }
  if (elapsed >= 3500) {
    return { ...task, status: 'generating', progress: Math.min(92, 25 + Math.floor(elapsed / 180)), statusMessage: '正在生成正文并套用 Word 格式', updatedAt: new Date().toISOString() }
  }
  return task
}

export async function signInWithWechat(): Promise<UserProfile> {
  if (ENABLE_DEMO_MODE) {
    setToken('demo-token')
    return { id: 'demo-user', nickname: '微信用户', balance: 28.6, generatedCount: demoTasks().filter(item => item.status === 'completed').length }
  }
  const login = await Taro.login()
  const result = await request<{ token: string; user: UserProfile }>(ENDPOINTS.login, {
    method: 'POST',
    data: { code: login.code }
  })
  setToken(result.token)
  return result.user
}

export async function getProfile(): Promise<UserProfile | null> {
  if (!getToken()) return null
  if (ENABLE_DEMO_MODE) {
    return { id: 'demo-user', nickname: '微信用户', balance: 28.6, generatedCount: demoTasks().filter(item => evolveDemoTask(item).status === 'completed').length }
  }
  return request<UserProfile>(ENDPOINTS.me)
}

export async function uploadTemplate(filePath: string, name: string): Promise<{ assetId: string; name: string }> {
  if (ENABLE_DEMO_MODE) return { assetId: `demo-${Date.now()}`, name }
  const token = getToken()
  const response = await Taro.uploadFile({
    url: apiUrl(ENDPOINTS.templates),
    filePath,
    name: 'template',
    timeout: 30000,
    header: token ? { Authorization: `Bearer ${token}` } : {},
    formData: { name }
  })
  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error('格式范本上传失败')
  const body = JSON.parse(response.data) as { template?: { fileName?: string } }
  return { assetId: `template-${Date.now()}`, name: body.template?.fileName || name }
}

export async function createArticle(input: ArticleDraft): Promise<ArticleTask> {
  if (!ENABLE_DEMO_MODE) {
    const result = await request<{ job: ApiGenerationJob }>(ENDPOINTS.articles, {
      method: 'POST',
      header: { 'Idempotency-Key': `mini-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` },
      data: {
        topic: input.subject,
        requirements: [`用途：${input.purpose}`, input.formatInstructions].filter(Boolean).join('\n'),
        providerId: input.provider,
        outline: input.outline?.split(/[\n；;]/u).map(item => item.trim()).filter(Boolean),
        targetCharacters: input.targetWords
      }
    })
    return mapApiJob(result.job, input)
  }
  const now = new Date().toISOString()
  const task: ArticleTask = {
    id: `demo-${Date.now()}`,
    subject: input.subject,
    purpose: input.purpose,
    targetWords: input.targetWords,
    provider: input.provider,
    providerLabel: providerLabels[input.provider],
    status: 'queued',
    progress: 8,
    statusMessage: '任务已进入生成队列',
    createdAt: now,
    updatedAt: now,
    templateName: input.templateName
  }
  writeDemoData([task, ...demoTasks()])
  return task
}

export async function listArticles(): Promise<ArticleTask[]> {
  if (!ENABLE_DEMO_MODE) {
    const result = await request<{ jobs: ApiGenerationJob[] }>(ENDPOINTS.articles)
    return result.jobs.map(job => mapApiJob(job))
  }
  const next = demoTasks().map(evolveDemoTask)
  writeDemoData(next)
  return next
}

export async function getArticle(id: string): Promise<ArticleTask> {
  if (!ENABLE_DEMO_MODE) {
    const result = await request<{ job: ApiGenerationJob }>(ENDPOINTS.article(id))
    return mapApiJob(result.job)
  }
  const task = demoTasks().find(item => item.id === id)
  if (!task) throw new Error('没有找到这个生成任务')
  const next = evolveDemoTask(task)
  writeDemoData(demoTasks().map(item => item.id === id ? next : item))
  return next
}

export async function downloadArticle(task: ArticleTask) {
  if (ENABLE_DEMO_MODE || task.documentUrl?.startsWith('demo://')) {
    await Taro.showModal({ title: '演示模式', content: '当前是本地演示任务。接入正式 API 后会在这里下载并打开 Word 文档。', showCancel: false })
    return
  }
  const token = getToken()
  const response = await Taro.downloadFile({
    url: task.documentUrl || apiUrl(ENDPOINTS.download(task.id)),
    header: token ? { Authorization: `Bearer ${token}` } : {}
  })
  if (response.statusCode !== 200) throw new Error('Word 文档下载失败')
  await Taro.openDocument({ filePath: response.tempFilePath, fileType: 'docx', showMenu: true })
}

export async function navigateToBookstore() {
  if (BOOKSTORE_MINIAPP_APPID) {
    await Taro.navigateToMiniProgram({ appId: BOOKSTORE_MINIAPP_APPID, path: 'pages/index/index' })
    return
  }
  if (BOOKSTORE_WEB_URL) {
    await Taro.navigateTo({ url: `/pages/webview/index?url=${encodeURIComponent(BOOKSTORE_WEB_URL)}` })
    return
  }
  await Taro.showToast({ title: '二手书入口暂未配置', icon: 'none' })
}

interface ApiGenerationJob {
  id: string
  topic: string
  providerId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  progress: number
  createdAt: string
  updatedAt: string
  error?: string
}

function mapApiJob(job: ApiGenerationJob, draft?: ArticleDraft): ArticleTask {
  const provider = (job.providerId === 'mock' ? 'smart' : job.providerId) as ProviderId
  const statusMap: Record<ApiGenerationJob['status'], TaskStatus> = {
    queued: 'queued',
    running: 'generating',
    succeeded: 'completed',
    failed: 'failed'
  }
  const status = statusMap[job.status]
  return {
    id: job.id,
    subject: job.topic,
    purpose: draft?.purpose || '文章生成',
    targetWords: draft?.targetWords || 0,
    provider,
    providerLabel: providerLabels[provider] || job.providerId,
    status,
    progress: job.progress,
    statusMessage: status === 'completed' ? 'Word 文档已生成' : status === 'failed' ? '生成失败' : status === 'generating' ? '正在生成并排版' : '任务已进入生成队列',
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    templateName: draft?.templateName,
    documentUrl: status === 'completed' ? apiUrl(ENDPOINTS.download(job.id)) : undefined,
    errorMessage: job.error
  }
}
