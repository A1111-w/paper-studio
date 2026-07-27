import { Button, Icon, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'
import EmptyState from '@/components/EmptyState'
import { downloadArticle, getArticle, type ArticleTask, type TaskStatus } from '@/services/api'
import { formatDateTime } from '@/utils/format'
import './index.scss'

const statusMeta: Record<TaskStatus, { label: string; icon: 'waiting' | 'success' | 'warn'; color: string }> = {
  queued: { label: '排队中', icon: 'waiting', color: '#c37a16' },
  generating: { label: '正在生成', icon: 'waiting', color: '#c37a16' },
  completed: { label: '生成完成', icon: 'success', color: '#087a60' },
  failed: { label: '生成失败', icon: 'warn', color: '#c7463a' }
}

export default function TaskDetailPage() {
  const { params } = useRouter()
  const id = params.id ? decodeURIComponent(params.id) : ''
  const [task, setTask] = useState<ArticleTask | null>(null)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const next = await getArticle(id)
      setTask(next)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '任务加载失败')
    }
  }, [id])

  useEffect(() => {
    void load()
    const timer = setInterval(() => {
      if (!task || task.status === 'queued' || task.status === 'generating') void load()
    }, 2500)
    return () => clearInterval(timer)
  }, [load, task?.status])

  async function download() {
    if (!task) return
    setDownloading(true)
    try {
      await downloadArticle(task)
    } catch (downloadError) {
      Taro.showToast({ title: downloadError instanceof Error ? downloadError.message : '下载失败', icon: 'none' })
    } finally {
      setDownloading(false)
    }
  }

  if (error) return <View className='page'><EmptyState title='任务不可用' description={error} actionText='返回任务列表' onAction={() => Taro.switchTab({ url: '/pages/tasks/index' })} /></View>
  if (!task) return <View className='page task-detail__loading'><Icon type='waiting' size={32} color='#087a60' /><Text>正在读取任务…</Text></View>

  const status = statusMeta[task.status]
  return (
    <View className='page task-detail'>
      <View className='task-detail__status'>
        <Icon type={status.icon} size={42} color={status.color} />
        <Text className='task-detail__status-name' style={{ color: status.color }}>{status.label}</Text>
        <Text className='task-detail__status-message'>{task.errorMessage || task.statusMessage}</Text>
        {(task.status === 'queued' || task.status === 'generating') && (
          <View className='task-detail__progress'>
            <View className='task-detail__progress-value' style={{ width: `${task.progress}%` }} />
          </View>
        )}
        {(task.status === 'queued' || task.status === 'generating') && <Text className='task-detail__percent'>{task.progress}%</Text>}
      </View>

      <View className='task-detail__document'>
        <Text className='task-detail__subject'>{task.subject}</Text>
        <View className='task-detail__rows'>
          <View><Text>用途</Text><Text>{task.purpose}</Text></View>
          <View><Text>目标篇幅</Text><Text>{task.targetWords.toLocaleString()} 字</Text></View>
          <View><Text>生成线路</Text><Text>{task.providerLabel}</Text></View>
          <View><Text>格式范本</Text><Text>{task.templateName || '文字格式要求'}</Text></View>
          <View><Text>创建时间</Text><Text>{formatDateTime(task.createdAt)}</Text></View>
          <View><Text>任务编号</Text><Text className='task-detail__id'>{task.id}</Text></View>
        </View>
      </View>

      {task.status === 'completed' && <Button className='primary-button task-detail__action' loading={downloading} onClick={() => { void download() }}>下载并打开 Word</Button>}
      {task.status === 'failed' && <Button className='primary-button task-detail__action' onClick={() => Taro.navigateTo({ url: '/pages/create/index' })}>重新创建文章</Button>}
      {(task.status === 'queued' || task.status === 'generating') && <View className='notice task-detail__notice'>可以先离开此页，任务会在服务端继续执行。</View>}
    </View>
  )
}
