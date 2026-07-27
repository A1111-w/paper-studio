import { WebView } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'

export default function WebviewPage() {
  const { params } = useRouter()
  const url = params.url ? decodeURIComponent(params.url) : ''
  return <WebView src={url} />
}
