import { Button, Icon, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

export default function RechargePage() {
  return (
    <View className='page placeholder-page'>
      <View className='placeholder-page__main'>
        <View className='placeholder-page__icon'><Icon type='download' size={38} color='#087a60' /></View>
        <Text className='placeholder-page__title'>充值功能筹备中</Text>
        <Text className='placeholder-page__copy'>支付渠道、套餐和退款规则确认后再正式开放。当前页面不会发起支付，也不会创建任何订单。</Text>
        <View className='placeholder-page__status'><Text>当前状态</Text><Text>尚未接入</Text></View>
      </View>
      <Button className='secondary-button' onClick={() => Taro.navigateBack()}>返回</Button>
    </View>
  )
}
