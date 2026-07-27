export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/tasks/index',
    'pages/profile/index',
    'pages/create/index',
    'pages/task-detail/index',
    'pages/recharge/index',
    'pages/similarity/index',
    'pages/webview/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '文核',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f3f5f4'
  },
  tabBar: {
    color: '#7a8580',
    selectedColor: '#087a60',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/index/index', text: '首页' },
      { pagePath: 'pages/tasks/index', text: '任务' },
      { pagePath: 'pages/profile/index', text: '我的' }
    ]
  }
})
