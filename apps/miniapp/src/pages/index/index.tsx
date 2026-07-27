import { Button, Icon, Text, View } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { useCallback, useState } from 'react'
import EmptyState from '@/components/EmptyState'
import TaskCard from '@/components/TaskCard'
import { listArticles, navigateToBookstore, type ArticleTask } from '@/services/api'
import './index.scss'

const services = [
  { title: '账户充值', copy: '充值方案筹备中', path: '/pages/recharge/index', icon: 'download' as const },
  { title: '论文查重', copy: '等待查重能力接入', path: '/pages/similarity/index', icon: 'search' as const }
]

export default function HomePage() {
  const [tasks, setTasks] = useState<ArticleTask[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTasks((await listArticles()).slice(0, 3))
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '任务加载失败', icon: 'none' })
    } finally {
      setLoading(false)
      Taro.stopPullDownRefresh()
    }
  }, [])

  useDidShow(() => { void load() })
  usePullDownRefresh(() => { void load() })

  return (
    <View className='page home'>
      <View className='home__brand'>
        <View>
          <Text className='home__brand-name'>文核</Text>
          <Text className='home__brand-copy'>论文写作工作台</Text>
        </View>
        <View className='home__service-state'>
          <View className='home__state-dot' />
          <Text>生成服务可用</Text>
        </View>
      </View>

      <View className='home__hero'>
        <Text className='home__hero-title'>按你的格式，生成可编辑 Word</Text>
        <Text className='home__hero-copy'>输入主题与篇幅，选择模型线路，格式范本会交给文档工具处理。</Text>
        <Button className='home__hero-action' onClick={() => Taro.navigateTo({ url: '/pages/create/index' })}>
          <Text>新建文章</Text>
        </Button>
        <View className='home__hero-foot'>
          <Text>DeepSeek 直连</Text>
          <Text>智能路由</Text>
          <Text>Word 格式套用</Text>
        </View>
      </View>

      <View className='section-heading'>
        <Text className='section-title'>最近任务</Text>
        <Text className='section-action' onClick={() => Taro.switchTab({ url: '/pages/tasks/index' })}>全部任务</Text>
      </View>
      <View className='home__task-list'>
        {!loading && tasks.length === 0
          ? <EmptyState title='还没有写作任务' description='从主题开始，新建你的第一篇文章。' actionText='立即新建' onAction={() => Taro.navigateTo({ url: '/pages/create/index' })} />
          : tasks.map(task => <TaskCard key={task.id} task={task} />)}
      </View>

      <View className='section-heading'><Text className='section-title'>更多服务</Text></View>
      <View className='home__service-list'>
        {services.map(service => (
          <View className='home__service-row' key={service.title} onClick={() => Taro.navigateTo({ url: service.path })}>
            <View className='home__service-icon'><Icon type={service.icon} size={22} color='#087a60' /></View>
            <View className='home__service-content'>
              <Text className='home__service-title'>{service.title}</Text>
              <Text className='home__service-copy'>{service.copy}</Text>
            </View>
            <Text className='home__chevron'>›</Text>
          </View>
        ))}
        <View className='home__service-row' onClick={() => { void navigateToBookstore() }}>
          <View className='home__service-icon'><Icon type='info' size={22} color='#087a60' /></View>
          <View className='home__service-content'>
            <Text className='home__service-title'>二手书平台</Text>
            <Text className='home__service-copy'>前往独立部署的二手书服务</Text>
          </View>
          <Text className='home__chevron'>›</Text>
        </View>
      </View>
    </View>
  )
}
