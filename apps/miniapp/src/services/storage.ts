import Taro from '@tarojs/taro'

const TOKEN_KEY = 'wenhe.session.token'
const TASKS_KEY = 'wenhe.demo.tasks'

export function getToken(): string {
  return Taro.getStorageSync<string>(TOKEN_KEY) || ''
}

export function setToken(token: string) {
  Taro.setStorageSync(TOKEN_KEY, token)
}

export function clearToken() {
  Taro.removeStorageSync(TOKEN_KEY)
}

export function readDemoData<T>(fallback: T): T {
  return Taro.getStorageSync<T>(TASKS_KEY) || fallback
}

export function writeDemoData<T>(value: T) {
  Taro.setStorageSync(TASKS_KEY, value)
}
