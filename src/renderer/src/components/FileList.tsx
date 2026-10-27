import { List, Progress, Tag, Typography, Empty } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import { openFile, useAppState } from '../store'
import { formatBytes, formatTime } from '../util'

export default function FileList() {
  const s = useAppState()

  return (
    <div className="file-list">
      <div className="file-list-header">日志文件</div>
      {s.files.length === 0 ? (
        <Empty style={{ marginTop: 40 }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文件" />
      ) : (
        <List
          size="small"
          dataSource={s.files}
          renderItem={(f) => {
            const active = s.activeFile?.path === f.path
            const indexing = active && s.indexing
            return (
              <div
                className={`file-item ${active ? 'active' : ''}`}
                onClick={() => void openFile(f.path)}
              >
                <div className="file-item-top">
                  <FileTextOutlined />
                  <Typography.Text ellipsis={{ tooltip: f.name }} className="file-name">
                    {f.name}
                  </Typography.Text>
                  {f.lineCount !== undefined && (
                    <Tag className="file-count">{f.lineCount.toLocaleString()} 行</Tag>
                  )}
                </div>
                <div className="file-item-meta">
                  <span>{formatBytes(f.size)}</span>
                  <span>{formatTime(f.mtime)}</span>
                </div>
                {indexing && s.indexProgress && (
                  <Progress
                    percent={Math.round((s.indexProgress.bytesScanned / s.indexProgress.totalBytes) * 100)}
                    size="small"
                    status="active"
                    format={(p) => `${p}% · ${s.indexProgress!.linesFound.toLocaleString()} 行`}
                  />
                )}
              </div>
            )
          }}
        />
      )}
    </div>
  )
}
