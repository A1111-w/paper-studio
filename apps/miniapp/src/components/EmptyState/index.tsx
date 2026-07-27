import { Button, Icon, Text, View } from '@tarojs/components'

interface Props {
  title: string
  description: string
  actionText?: string
  onAction?: () => void
}

export default function EmptyState({ title, description, actionText, onAction }: Props) {
  return (
    <View className='empty-state'>
      <Icon type='info' size={36} color='#87948f' />
      <Text className='empty-title'>{title}</Text>
      <Text className='empty-copy'>{description}</Text>
      {actionText && onAction && <Button className='secondary-button' onClick={onAction}>{actionText}</Button>}
    </View>
  )
}
