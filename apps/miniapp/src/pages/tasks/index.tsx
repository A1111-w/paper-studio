import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { useCallback, useMemo, useState } from 'react'
import EmptyState from '@/components/EmptyState'
import TaskCard from '@/components/TaskCard'
import { listArticles, type ArticleTask, type TaskStatus } from '@/services/api'
import './index.scss'

type Filter = 'all' | TaskStatus
const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'generating', label: '生成中' },
  { id: 'completed', label: '已完成' },
  { id: 'failed', label: '失败' }
]

export default function TasksPage() {
  const [tasks, setTasks] = useState<ArticleTask[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTasks(await listArticles())
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '任务加载失败', icon: 'none' })
    } finally {
      setLoading(false)
      Taro.stopPullDownRefresh()
    }
  }, [])

  useDidShow(() => { void load() })
  usePullDownRefresh(() => { void load() })

  const filtered = useMemo(() => filter === 'all'
    ? tasks
    : filter === 'generating'
      ? tasks.filter(task => task.status === 'generating' || task.status === 'queued')
      : tasks.filter(task => task.status === filter), [filter, tasks])

  return (
    <View className='page tasks-page'>
      <View className='tasks-page__header'>
        <View>
          <Text className='page-title'>写作任务</Text>
          <Text className='page-subtitle'>任务在后台持续处理，完成后可下载 Word。</Text>
        </View>
        <Button className='tasks-page__new' onClick={() => Taro.navigateTo({ url: '/pages/create/index' })}>新建</Button>
      </View>
      <View className='tasks-page__filters'>
        {filters.map(item => (
          <View className={`tasks-page__filter ${filter === item.id ? 'active' : ''}`} key={item.id} onClick={() => setFilter(item.id)}>{item.label}</View>
        ))}
      </View>
      <View className='tasks-page__list'>
        {!loading && filtered.length === 0
          ? <EmptyState title='当前没有任务' description={filter === 'all' ? '新建文章后，生成进度会显示在这里。' : '这个状态下暂时没有任务。'} actionText='新建文章' onAction={() => Taro.navigateTo({ url: '/pages/create/index' })} />
          : filtered.map(task => <TaskCard key={task.id} task={task} />)}
      </View>
    </View>
  )
}
