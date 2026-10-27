import { Button, DatePicker, Input, Progress, Select, Space, Switch, Tooltip, Tag } from 'antd'
import { SearchOutlined, CloseOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { LEVEL_ORDER, type LogLevel } from '../../../shared/types'
import { cancelSearch, clearSearch, runSearch, setSearchQuery, useAppState } from '../store'
import { LEVEL_COLORS } from '../util'

const { RangePicker } = DatePicker

const levelOptions = LEVEL_ORDER.filter((l) => l !== 'UNKNOWN').map((l) => ({
  value: l,
  label: <span style={{ color: LEVEL_COLORS[l] }}>{l}</span>
}))

export default function SearchBar() {
  const s = useAppState()
  const q = s.searchQuery

  const onTime = (range: [Dayjs | null, Dayjs | null] | null) => {
    setSearchQuery({
      timeFrom: range?.[0] ? range[0].valueOf() : undefined,
      timeTo: range?.[1] ? range[1].valueOf() : undefined
    })
  }

  const pct = s.searchProgress
    ? Math.round((s.searchProgress.bytesScanned / s.searchProgress.totalBytes) * 100)
    : 0

  return (
    <div className="search-bar">
      <div className="search-row">
        <Input.Search
          placeholder="关键字搜索（支持正则）"
          allowClear
          value={q.keyword ?? ''}
          onChange={(e) => setSearchQuery({ keyword: e.target.value })}
          onSearch={() => void runSearch()}
          enterButton={<SearchOutlined />}
          style={{ flex: 1, minWidth: 200 }}
          disabled={!s.activeFile}
        />
        <Select
          mode="multiple"
          placeholder="级别过滤"
          allowClear
          maxTagCount="responsive"
          value={q.levels}
          options={levelOptions}
          onChange={(v) => setSearchQuery({ levels: v as LogLevel[] })}
          style={{ width: 220 }}
          disabled={!s.activeFile}
        />
        <RangePicker
          showTime
          allowEmpty={[true, true]}
          onChange={(v) => onTime(v as [Dayjs | null, Dayjs | null] | null)}
          style={{ width: 360 }}
          disabled={!s.activeFile}
        />
        <Space>
          <Tooltip title="区分大小写">
            <span className="toggle">
              大小写
              <Switch
                size="small"
                checked={!!q.caseSensitive}
                onChange={(v) => setSearchQuery({ caseSensitive: v })}
              />
            </span>
          </Tooltip>
          <Tooltip title="正则表达式">
            <span className="toggle">
              正则
              <Switch size="small" checked={!!q.regex} onChange={(v) => setSearchQuery({ regex: v })} />
            </span>
          </Tooltip>
        </Space>
        {s.searching ? (
          <Button danger icon={<CloseOutlined />} onClick={cancelSearch}>
            取消
          </Button>
        ) : (
          s.searchApplied && (
            <Button icon={<CloseOutlined />} onClick={clearSearch}>
              清除结果
            </Button>
          )
        )}
      </div>

      {s.searching && s.searchProgress && (
        <div className="progress-row">
          <Progress
            percent={pct}
            status="active"
            size="small"
            format={(p) => `${p}% · 已扫描 ${(s.searchProgress!.bytesScanned / 1048576).toFixed(0)}MB · ${s.searchProgress!.matches.toLocaleString()} 条匹配`}
          />
        </div>
      )}

      {s.searchApplied && s.searchResult && (
        <div className="result-meta">
          <Tag color="cyan">{s.searchResult.totalMatches.toLocaleString()} 条匹配</Tag>
          <Tag>{s.searchResult.durationMs}ms</Tag>
          {s.searchResult.truncated && <Tag color="orange">结果已截断</Tag>}
        </div>
      )}
    </div>
  )
}
