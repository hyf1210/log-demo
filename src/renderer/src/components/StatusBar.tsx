import { Segmented, Tag } from 'antd'
import { setView, useAppState } from '../store'
import { formatBytes } from '../util'

export default function StatusBar() {
  const s = useAppState()
  const f = s.files.find((f) => f.path === s.activeFile?.path)

  return (
    <div className="status-bar">
      <Segmented
        size="small"
        value={s.view}
        onChange={(v) => setView(v as 'log' | 'stats')}
        options={[
          { label: '日志', value: 'log' },
          { label: '统计分析', value: 'stats' }
        ]}
      />
      {f && (
        <div className="status-info">
          <Tag>{f.name}</Tag>
          <Tag>{formatBytes(f.size)}</Tag>
          {f.lineCount !== undefined && <Tag>{f.lineCount.toLocaleString()} 行</Tag>}
        </div>
      )}
    </div>
  )
}
