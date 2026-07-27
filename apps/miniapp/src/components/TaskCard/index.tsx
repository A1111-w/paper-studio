import { Icon, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { ArticleTask, TaskStatus } from '@/services/api'
import { formatDateTime } from '@/utils/format'
import './index.scss'

const statusMeta: Record<TaskStatus, { label: string; className: string; icon: 'waiting' | 'success' | 'warn' }> = {
  queued: { label: '排队中', className: 'queued', icon: 'waiting' },
  generating: { label: '生成中', className: 'running', icon: 'waiting' },
  completed: { label: '已完成', className: 'completed', icon: 'success' },
  failed: { label: '失败', className: 'failed', icon: 'warn' }
}

interface Props {
  task: ArticleTask
}

export default function TaskCard({ task }: Props) {
  const meta = statusMeta[task.status]
  return (
    <View className='task-card' onClick={() => Taro.navigateTo({ url: `/pages/task-detail/index?id=${encodeURIComponent(task.id)}` })}>
      <View className='task-card__top'>
        <Text className='task-card__title'>{task.subject}</Text>
        <View className={`task-card__status ${meta.className}`}>
          <Icon type={meta.icon} size={14} />
          <Text>{meta.label}</Text>
        </View>
      </View>
      <View className='task-card__meta'>
        <Text>{task.purpose}</Text>
        <Text>{task.targetWords.toLocaleString()} 字</Text>
        <Text>{task.providerLabel}</Text>
      </View>
      {(task.status === 'queued' || task.status === 'generating') && (
        <View className='task-card__progress' aria-label={`生成进度 ${task.progress}%`}>
          <View className='task-card__progress-value' style={{ width: `${task.progress}%` }} />
        </View>
      )}
      <View className='task-card__footer'>
        <Text>{formatDateTime(task.createdAt)}</Text>
        <Text className='task-card__detail'>查看详情</Text>
      </View>
    </View>
  )
}
