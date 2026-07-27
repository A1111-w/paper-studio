import { Button, Icon, Input, Picker, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useMemo, useState } from 'react'
import { createArticle, uploadTemplate, type ProviderId } from '@/services/api'
import './index.scss'

const purposeOptions = ['课程论文', '毕业论文', '期刊初稿', '调研报告', '工作材料']
const lengthOptions = [
  { label: '短篇 · 约 2,000 字', value: 2000 },
  { label: '标准 · 约 5,000 字', value: 5000 },
  { label: '长篇 · 约 8,000 字', value: 8000 },
  { label: '深度 · 约 12,000 字', value: 12000 }
]
const providerOptions: Array<{ id: ProviderId; name: string; copy: string }> = [
  { id: 'smart', name: '智能路由', copy: '根据可用性自动选择稳定线路' },
  { id: 'deepseek', name: 'DeepSeek 直连', copy: '直接调用 DeepSeek 官方接口' },
  { id: 'relay', name: '兼容中转站', copy: '调用后台配置的 OpenAI 兼容线路' }
]

interface TemplateFile {
  name: string
  path: string
  size: number
}

export default function CreatePage() {
  const [subject, setSubject] = useState('')
  const [purposeIndex, setPurposeIndex] = useState(0)
  const [lengthIndex, setLengthIndex] = useState(1)
  const [providerIndex, setProviderIndex] = useState(0)
  const [formatInstructions, setFormatInstructions] = useState('')
  const [outline, setOutline] = useState('')
  const [template, setTemplate] = useState<TemplateFile | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = useMemo(() => subject.trim().length >= 4 && formatInstructions.trim().length >= 5 && !submitting, [subject, formatInstructions, submitting])

  async function chooseTemplate() {
    try {
      const result = await Taro.chooseMessageFile({ count: 1, type: 'file', extension: ['docx'] })
      const file = result.tempFiles[0]
      if (!file) return
      if (file.size > 10 * 1024 * 1024) {
        await Taro.showToast({ title: '格式范本不能超过 10MB', icon: 'none' })
        return
      }
      setTemplate({ name: file.name, path: file.path, size: file.size })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('cancel')) Taro.showToast({ title: '文件选择失败', icon: 'none' })
    }
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    Taro.showLoading({ title: template ? '上传范本中' : '创建任务中', mask: true })
    try {
      const asset = template ? await uploadTemplate(template.path, template.name) : undefined
      Taro.showLoading({ title: '创建任务中', mask: true })
      const task = await createArticle({
        subject: subject.trim(),
        purpose: purposeOptions[purposeIndex],
        targetWords: lengthOptions[lengthIndex].value,
        provider: providerOptions[providerIndex].id,
        formatInstructions: formatInstructions.trim(),
        outline: outline.trim() || undefined,
        templateAssetId: asset?.assetId,
        templateName: asset?.name
      })
      Taro.hideLoading()
      await Taro.showToast({ title: '任务已创建', icon: 'success', duration: 1000 })
      setTimeout(() => Taro.redirectTo({ url: `/pages/task-detail/index?id=${encodeURIComponent(task.id)}` }), 900)
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({ title: error instanceof Error ? error.message : '创建任务失败', icon: 'none', duration: 2600 })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='page create-page'>
      <Text className='page-title'>新建文章</Text>
      <Text className='page-subtitle'>填写写作要求，完成后可直接下载可编辑的 Word 文档。</Text>

      <View className='create-page__section'>
        <View className='create-page__section-title'><Text className='create-page__step'>01</Text><Text>写作内容</Text></View>
        <View className='field'>
          <Text className='field-label'>文章主题</Text>
          <Input className='input' maxlength={120} value={subject} placeholder='例如：数字经济背景下的企业管理创新' onInput={event => setSubject(event.detail.value)} />
          <Text className='field-hint'>{subject.length}/120，至少输入 4 个字</Text>
        </View>
        <View className='create-page__two-columns'>
          <View className='field'>
            <Text className='field-label'>文章用途</Text>
            <Picker mode='selector' range={purposeOptions} value={purposeIndex} onChange={event => setPurposeIndex(Number(event.detail.value))}>
              <View className='picker-control'><Text>{purposeOptions[purposeIndex]}</Text><Text className='placeholder'>选择</Text></View>
            </Picker>
          </View>
          <View className='field'>
            <Text className='field-label'>目标篇幅</Text>
            <Picker mode='selector' range={lengthOptions} rangeKey='label' value={lengthIndex} onChange={event => setLengthIndex(Number(event.detail.value))}>
              <View className='picker-control'><Text>{lengthOptions[lengthIndex].label}</Text><Text className='placeholder'>选择</Text></View>
            </Picker>
          </View>
        </View>
        <View className='field'>
          <Text className='field-label'>文章提纲（选填）</Text>
          <Textarea className='textarea create-page__outline' maxlength={2000} value={outline} placeholder='可粘贴章节提纲；留空时由 AI 自动规划。' onInput={event => setOutline(event.detail.value)} />
        </View>
      </View>

      <View className='create-page__section'>
        <View className='create-page__section-title'><Text className='create-page__step'>02</Text><Text>Word 格式</Text></View>
        <View className='field'>
          <Text className='field-label'>格式要求</Text>
          <Textarea className='textarea' maxlength={3000} value={formatInstructions} placeholder='粘贴学校或单位的格式要求，例如：一级标题黑体三号，正文宋体小四，1.5 倍行距……' onInput={event => setFormatInstructions(event.detail.value)} />
          <Text className='field-hint'>文档工具会把字体、字号、标题层级、段落和页边距转换为 Word 样式。</Text>
        </View>
        <View className='field'>
          <Text className='field-label'>导入格式范本（选填）</Text>
          <View className={`create-page__upload ${template ? 'selected' : ''}`} onClick={() => { void chooseTemplate() }}>
            <Icon type={template ? 'success' : 'download'} size={25} color='#087a60' />
            <View className='create-page__upload-content'>
              <Text className='create-page__upload-title'>{template ? template.name : '从微信会话选择 DOCX'}</Text>
              <Text className='create-page__upload-copy'>{template ? `${(template.size / 1024 / 1024).toFixed(2)} MB · 点击重新选择` : '最大 10MB，仅提取排版样式，不读取无关内容'}</Text>
            </View>
          </View>
        </View>
      </View>

      <View className='create-page__section'>
        <View className='create-page__section-title'><Text className='create-page__step'>03</Text><Text>生成线路</Text></View>
        <View className='create-page__providers'>
          {providerOptions.map((provider, index) => (
            <View className={`create-page__provider ${providerIndex === index ? 'active' : ''}`} key={provider.id} onClick={() => setProviderIndex(index)}>
              <View className='create-page__radio'><View /></View>
              <View className='create-page__provider-content'>
                <Text className='create-page__provider-name'>{provider.name}</Text>
                <Text className='create-page__provider-copy'>{provider.copy}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View className='notice'>生成任务会在服务端排队处理。页面关闭后任务仍会继续，可在“任务”中查看进度和下载 Word。</View>
      <Button className='primary-button create-page__submit' disabled={!canSubmit} loading={submitting} onClick={() => { void submit() }}>提交生成任务</Button>
    </View>
  )
}
