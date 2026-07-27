import path from 'node:path'
import { defineConfig, type UserConfigExport } from '@tarojs/cli'

const config: UserConfigExport = {
  projectName: 'wenhe-miniapp',
  date: '2026-07-27',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: {
    type: 'webpack5',
    prebundle: { enable: false }
  },
  cache: { enable: true },
  alias: {
    '@': path.resolve(__dirname, '..', 'src')
  },
  defineConstants: {
    API_BASE_URL: JSON.stringify(process.env.TARO_APP_API_BASE_URL || 'http://127.0.0.1:8787'),
    BOOKSTORE_WEB_URL: JSON.stringify(process.env.TARO_APP_BOOKSTORE_WEB_URL || ''),
    BOOKSTORE_MINIAPP_APPID: JSON.stringify(process.env.TARO_APP_BOOKSTORE_MINIAPP_APPID || ''),
    ENABLE_DEMO_MODE: JSON.stringify(process.env.TARO_APP_ENABLE_DEMO_MODE === 'true')
  },
  mini: {
    postcss: {
      pxtransform: { enable: true, config: {} },
      url: { enable: true, config: { limit: 1024 } },
      cssModules: { enable: false }
    }
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    postcss: {
      autoprefixer: { enable: true, config: {} },
      cssModules: { enable: false }
    }
  }
}

export default defineConfig(async (merge, { command }) => {
  const envConfig = command === 'build'
    ? await import('./prod')
    : await import('./dev')

  return merge({}, config, envConfig.default)
})
