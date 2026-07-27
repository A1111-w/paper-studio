import { Button, Icon, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useState } from 'react'
import { getProfile, navigateToBookstore, signInWithWechat, type UserProfile } from '@/services/api'
import { clearToken } from '@/services/storage'
import { formatMoney } from '@/utils/format'
import './index.scss'

const menuItems = [
  { title: '账户充值', copy: '充值功能筹备中', path: '/pages/recharge/index', icon: 'download' as const },
  { title: '查重服务', copy: '等待能力接入', path: '/pages/similarity/index', icon: 'search' as const }
]

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    try { setProfile(await getProfile()) } catch { setProfile(null) }
  }, [])
  useDidShow(() => { void load() })

  async function login() {
    setLoading(true)
    try {
      setProfile(await signInWithWechat())
      Taro.showToast({ title: '登录成功', icon: 'success' })
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '登录失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    const result = await Taro.showModal({ title: '退出登录', content: '退出后不会删除已经生成的文章。' })
    if (!result.confirm) return
    clearToken()
    setProfile(null)
  }

  return (
    <View className='page profile-page'>
      <View className='profile-page__identity'>
        <View className='profile-page__avatar'><Text>{profile?.nickname?.slice(0, 1) || '文'}</Text></View>
        <View className='profile-page__identity-copy'>
          <Text className='profile-page__name'>{profile?.nickname || '未登录'}</Text>
          <Text className='profile-page__sub'>{profile ? (profile.mobileMasked || '微信账户已连接') : '登录后同步任务与文档'}</Text>
        </View>
        {!profile && <Button className='profile-page__login' loading={loading} onClick={() => { void login() }}>微信登录</Button>}
      </View>

      <View className='profile-page__balance'>
        <View>
          <Text className='profile-page__balance-label'>账户余额</Text>
          <Text className='profile-page__balance-value'>{profile ? formatMoney(profile.balance) : '—'}</Text>
        </View>
        <View className='profile-page__metric'>
          <Text>{profile?.generatedCount ?? 0}</Text>
          <Text>已完成文章</Text>
        </View>
        <Button className='profile-page__recharge' onClick={() => Taro.navigateTo({ url: '/pages/recharge/index' })}>充值</Button>
      </View>

      <View className='section-heading'><Text className='section-title'>服务与入口</Text></View>
      <View className='profile-page__menu'>
        {menuItems.map(item => (
          <View className='profile-page__menu-item' key={item.title} onClick={() => Taro.navigateTo({ url: item.path })}>
            <Icon type={item.icon} size={21} color='#087a60' />
            <View><Text>{item.title}</Text><Text>{item.copy}</Text></View>
            <Text className='profile-page__chevron'>›</Text>
          </View>
        ))}
        <View className='profile-page__menu-item' onClick={() => { void navigateToBookstore() }}>
          <Icon type='info' size={21} color='#087a60' />
          <View><Text>二手书平台</Text><Text>跳转到独立部署的二手书服务</Text></View>
          <Text className='profile-page__chevron'>›</Text>
        </View>
      </View>

      <View className='profile-page__legal'>
        <Text>内容生成结果需由用户自行核对并合理使用</Text>
        <Text>文核 · 微信小程序</Text>
      </View>
      {profile && <Button className='danger-button profile-page__logout' onClick={() => { void logout() }}>退出登录</Button>}
    </View>
  )
}
