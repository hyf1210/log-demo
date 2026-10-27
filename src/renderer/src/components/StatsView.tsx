import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts'
import { Button, Empty, Progress, Table, Tag, Statistic, Card, Row, Col } from 'antd'
import type { EChartsOption } from 'echarts'
import { LEVEL_ORDER, type LogLevel } from '../../../shared/types'
import { cancelStats, runStats, useAppState } from '../store'
import { LEVEL_COLORS } from '../util'

function formatTick(ts: number): string {
  const d = new Date(ts)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

function EChart({ option, height }: { option: EChartsOption; height: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    chartRef.current = chart
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.dispose()
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  return <div ref={ref} style={{ width: '100%', height }} />
}

export default function StatsView() {
  const s = useAppState()
  const res = s.statsResult

  const timeSeriesOption = useMemo<EChartsOption | null>(() => {
    if (!res || res.timeSeries.length === 0) return null
    const levels = LEVEL_ORDER.filter((l) => l !== 'UNKNOWN' && res.levelTotals[l])
    return {
      backgroundColor: 'transparent',
      textStyle: { color: '#c9d1d9' },
      tooltip: { trigger: 'axis' },
      legend: { textStyle: { color: '#c9d1d9' }, top: 0 },
      grid: { left: 48, right: 16, top: 32, bottom: 28 },
      xAxis: {
        type: 'category',
        data: res.timeSeries.map((b) => formatTick(b.ts)),
        axisLine: { lineStyle: { color: '#30363d' } },
        axisLabel: { color: '#8b949e' }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#21262d' } },
        axisLabel: { color: '#8b949e' }
      },
      series: levels.map((lvl) => ({
        name: lvl,
        type: 'line',
        stack: 'total',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5, color: LEVEL_COLORS[lvl] },
        itemStyle: { color: LEVEL_COLORS[lvl] },
        areaStyle: { opacity: 0.25 },
        data: res.timeSeries.map((b) => b.counts[lvl] ?? 0)
      }))
    }
  }, [res])

  const totalsOption = useMemo<EChartsOption | null>(() => {
    if (!res) return null
    const levels = LEVEL_ORDER.filter((l) => l !== 'UNKNOWN' && res.levelTotals[l])
    return {
      backgroundColor: 'transparent',
      textStyle: { color: '#c9d1d9' },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 48, right: 16, top: 16, bottom: 28 },
      xAxis: {
        type: 'category',
        data: levels,
        axisLine: { lineStyle: { color: '#30363d' } },
        axisLabel: { color: '#8b949e' }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#21262d' } },
        axisLabel: { color: '#8b949e' }
      },
      series: [
        {
          type: 'bar',
          data: levels.map((l) => ({
            value: res.levelTotals[l] ?? 0,
            itemStyle: { color: LEVEL_COLORS[l] }
          })),
          barMaxWidth: 48
        }
      ]
    }
  }, [res])

  return (
    <div className="stats-view">
      {!res && !s.statsLoading && (
        <div className="stats-empty">
          <Empty description="对当前文件运行一次统计分析" />
          <Button type="primary" onClick={() => void runStats()}>
            运行统计分析
          </Button>
        </div>
      )}

      {s.statsLoading && (
        <div className="stats-loading">
          <Progress
            percent={
              s.statsProgress
                ? Math.round((s.statsProgress.bytesScanned / s.statsProgress.totalBytes) * 100)
                : 0
            }
            status="active"
          />
          <Button danger onClick={cancelStats} style={{ marginTop: 16 }}>
            取消
          </Button>
        </div>
      )}

      {res && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            {LEVEL_ORDER.filter((l) => l !== 'UNKNOWN').map((l) => (
              <Col key={l} span={4}>
                <Card size="small">
                  <Statistic
                    title={l}
                    value={res.levelTotals[l] ?? 0}
                    valueStyle={{ color: LEVEL_COLORS[l], fontSize: 20 }}
                  />
                </Card>
              </Col>
            ))}
          </Row>

          <Card size="small" title="日志级别随时间分布" style={{ marginBottom: 16 }}>
            {timeSeriesOption ? <EChart option={timeSeriesOption} height={300} /> : <Empty description="无时间戳数据" />}
          </Card>

          <Row gutter={16}>
            <Col span={10}>
              <Card size="small" title="各级别总量">
                {totalsOption ? <EChart option={totalsOption} height={300} /> : null}
              </Card>
            </Col>
            <Col span={14}>
              <Card size="small" title={`Top ${res.topErrors.length} 错误聚类`}>
                <Table
                  size="small"
                  rowKey={(r) => r.message}
                  pagination={false}
                  dataSource={res.topErrors}
                  columns={[
                    {
                      title: '次数',
                      dataIndex: 'count',
                      width: 80,
                      sorter: (a, b) => b.count - a.count,
                      render: (v: number) => <Tag color="red">{v}</Tag>
                    },
                    {
                      title: '级别',
                      dataIndex: 'level',
                      width: 70,
                      render: (v: LogLevel) => <Tag color={LEVEL_COLORS[v]}>{v}</Tag>
                    },
                    { title: '消息签名', dataIndex: 'message', ellipsis: true },
                    { title: '样例', dataIndex: 'sample', ellipsis: true }
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  )
}
