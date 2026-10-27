import { Button, Space, Tag, Typography } from 'antd'
import { FolderOpenOutlined } from '@ant-design/icons'
import { openDir, useAppState } from '../store'
import { formatBytes } from '../util'

export default function Toolbar() {
  const s = useAppState()
  const mem = s.memory

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className="brand">LogLens</span>
        <Button type="primary" icon={<FolderOpenOutlined />} onClick={() => void openDir()}>
          导入目录
        </Button>
        <Typography.Text className="dir-path" ellipsis={{ tooltip: s.dir ?? '' }}>
          {s.dir ?? '尚未导入目录'}
        </Typography.Text>
      </div>
      <Space className="toolbar-right">
        {mem && (
          <>
            <Tag color="blue">主进程 RSS {mem.mainRssMB} MB</Tag>
            <Tag color="purple">全进程 {mem.totalRssMB} MB</Tag>
            <Tag color="green">堆 {mem.heapUsedMB} MB</Tag>
          </>
        )}
        {s.activeFile && <Tag>已打开 {formatBytes(fileSizeOf(s))}</Tag>}
      </Space>
    </div>
  )
}

function fileSizeOf(s: ReturnType<typeof useAppState>): number {
  const f = s.files.find((f) => f.path === s.activeFile?.path)
  return f?.size ?? 0
}
