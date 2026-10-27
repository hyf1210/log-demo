import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import { initStore, refreshMemory } from './store'
import { installCaptureHook } from './capture'
import './styles.css'

initStore()
installCaptureHook()
void refreshMemory()
setInterval(() => void refreshMemory(), 2000)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#58a6ff' } }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
)
