import { useCallback, useEffect, useRef, useState } from 'react'
import { Input, Spin } from 'antd'
import type { SearchHit } from '../../../shared/types'
import { useAppState } from '../store'
import { detectLevelFast, LEVEL_COLORS, LEVEL_BG } from '../util'

const ROW_HEIGHT = 20
// Chromium caps scrollTop around ~33.5M px. For files whose true height would
// exceed that, we use a fixed virtual scroll range and map scroll position to a
// line index (coarse scrollbar), so any line in a 2GB file stays reachable.
const MAX_SCROLL_PX = 30_000_000
const OVERSCAN = 10
const BATCH = 1000

export default function LogViewer() {
  const s = useAppState()
  const activeFile = s.activeFile
  const scrollRef = useRef<HTMLDivElement>(null)

  const searchMode = s.searchApplied && !!s.searchResult
  const hits = s.searchResult?.hits ?? []
  const total = searchMode ? hits.length : activeFile?.lineCount ?? 0

  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)
  const [jumpInput, setJumpInput] = useState('')

  // line-content cache for browse mode
  const [cache, setCache] = useState<Map<number, string>>(new Map())
  const cacheRef = useRef(cache)
  const fetchingRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setViewportH(el.clientHeight)
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rowsCount = Math.ceil(viewportH / ROW_HEIGHT) + OVERSCAN * 2

  const exactH = total * ROW_HEIGHT
  const scrollH = exactH <= MAX_SCROLL_PX ? exactH : MAX_SCROLL_PX
  const startLine = total > 0 ? Math.floor((scrollTop / scrollH) * total) : 0
  const start = Math.max(0, Math.min(startLine - OVERSCAN, Math.max(0, total - rowsCount)))

  // fetch missing line batches (browse mode only)
  useEffect(() => {
    if (searchMode || !activeFile || total === 0) return
    const path = activeFile.path
    const bStart = Math.floor(start / BATCH)
    const bEnd = Math.floor((start + rowsCount) / BATCH)
    for (let b = bStart; b <= bEnd; b++) {
      if (fetchingRef.current.has(b) || cacheRef.current.has(b * BATCH)) continue
      fetchingRef.current.add(b)
      const lineStart = b * BATCH
      window.loglens
        .readLines(path, lineStart, BATCH)
        .then(({ lines }) => {
          const next = new Map(cacheRef.current)
          for (let i = 0; i < lines.length; i++) next.set(lineStart + i, lines[i])
          cacheRef.current = next
          fetchingRef.current.delete(b)
          setCache(next)
        })
        .catch(() => fetchingRef.current.delete(b))
    }
  }, [start, rowsCount, searchMode, activeFile, total])

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  const jump = () => {
    const n = parseInt(jumpInput, 10)
    if (Number.isNaN(n) || total === 0) return
    const line = Math.max(0, Math.min(n - 1, total - 1))
    const top = (line / total) * scrollH
    if (scrollRef.current) scrollRef.current.scrollTop = top
    setScrollTop(top)
  }

  const rows: number[] = []
  for (let i = 0; i < rowsCount && start + i < total; i++) rows.push(start + i)

  const header = (() => {
    if (!activeFile) return ''
    if (searchMode) return `${s.searchResult!.totalMatches.toLocaleString()} 条匹配`
    if (activeFile.indexed) return `共 ${activeFile.lineCount!.toLocaleString()} 行`
    return '正在索引…'
  })()

  return (
    <div className="log-viewer">
      <div className="log-header">
        <span>{header}</span>
        <span className="jump">
          跳转到行
          <Input
            size="small"
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            onPressEnter={jump}
            style={{ width: 120 }}
          />
        </span>
      </div>
      <div className="log-scroll" ref={scrollRef} onScroll={onScroll}>
        {activeFile && s.indexing ? (
          <div className="log-loading">
            <Spin />
            <span>
              正在构建索引…{' '}
              {s.indexProgress
                ? `${Math.round((s.indexProgress.bytesScanned / s.indexProgress.totalBytes) * 100)}%`
                : ''}
            </span>
          </div>
        ) : (
          <div style={{ height: scrollH, position: 'relative' }}>
            <div style={{ position: 'sticky', top: 0 }}>
              {rows.map((ln) =>
                searchMode ? <SearchRow key={ln} hit={hits[ln]} /> : <BrowseRow key={ln} lineNo={ln} text={cache.get(ln)} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function BrowseRow({ lineNo, text }: { lineNo: number; text?: string }) {
  const level = text !== undefined ? detectLevelFast(text) : 'UNKNOWN'
  return (
    <div className="log-row">
      <span className="line-no">{lineNo + 1}</span>
      <span className="level-pill" style={{ color: LEVEL_COLORS[level], background: LEVEL_BG[level] }}>
        {level}
      </span>
      <span className="line-text">{text ?? ''}</span>
    </div>
  )
}

function SearchRow({ hit }: { hit: SearchHit }) {
  return (
    <div className="log-row">
      <span className="line-no">{hit.line + 1}</span>
      <span className="level-pill" style={{ color: LEVEL_COLORS[hit.level], background: LEVEL_BG[hit.level] }}>
        {hit.level}
      </span>
      <span className="line-text">{hit.preview}</span>
    </div>
  )
}
