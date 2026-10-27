import { Empty } from 'antd'
import Toolbar from './components/Toolbar'
import FileList from './components/FileList'
import SearchBar from './components/SearchBar'
import LogViewer from './components/LogViewer'
import StatsView from './components/StatsView'
import StatusBar from './components/StatusBar'
import { useAppState } from './store'

export default function App() {
  const s = useAppState()

  const hasFile = !!s.activeFile

  return (
    <div className="app">
      <Toolbar />
      <div className="app-body">
        <FileList />
        <div className="main-panel">
          <SearchBar />
          <div className="content">
            {!hasFile ? (
              <Empty
                style={{ marginTop: 80 }}
                description="打开一个日志文件开始探查"
              />
            ) : s.view === 'stats' ? (
              <StatsView />
            ) : (
              <LogViewer />
            )}
          </div>
          <StatusBar />
        </div>
      </div>
    </div>
  )
}
