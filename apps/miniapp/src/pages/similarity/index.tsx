import { Button, Icon, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import '../recharge/index.scss'

export default function SimilarityPage() {
  return (
    <View className='page placeholder-page'>
      <View className='placeholder-page__main'>
        <View className='placeholder-page__icon'><Icon type='search' size={38} color='#087a60' /></View>
        <Text className='placeholder-page__title'>查重能力等待接入</Text>
        <Text className='placeholder-page__copy'>查重服务方案尚未确定，本版本不上传论文、不执行比对，也不展示模拟结果。能力确认后再接入正式接口。</Text>
        <View className='placeholder-page__status'><Text>当前状态</Text><Text>等待接入</Text></View>
      </View>
      <Button className='secondary-button' onClick={() => Taro.navigateBack()}>返回</Button>
    </View>
  )
}
