declare const API_BASE_URL: string
declare const BOOKSTORE_WEB_URL: string
declare const BOOKSTORE_MINIAPP_APPID: string
declare const ENABLE_DEMO_MODE: boolean

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production'
  }
}
