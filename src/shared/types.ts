// Shared types used by both the main process and the renderer.

export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'UNKNOWN'

export const LEVEL_ORDER: LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', 'UNKNOWN']

export interface FileMeta {
  path: string
  name: string
  size: number
  mtime: number
  lineCount?: number
  indexed?: boolean
}

export interface IndexProgress {
  bytesScanned: number
  totalBytes: number
  linesFound: number
  done: boolean
}

export interface IndexResult {
  path: string
  lineCount: number
  durationMs: number
}

export interface SearchQuery {
  keyword?: string
  levels?: LogLevel[]
  timeFrom?: number
  timeTo?: number
  caseSensitive?: boolean
  regex?: boolean
  maxResults?: number
}

export interface SearchProgress {
  bytesScanned: number
  totalBytes: number
  matches: number
  done: boolean
}

export interface SearchHit {
  line: number // 0-based
  timestamp?: number
  level: LogLevel
  preview: string
}

export interface SearchResult {
  hits: SearchHit[]
  totalMatches: number
  truncated: boolean
  durationMs: number
}

export interface StatsProgress {
  bytesScanned: number
  totalBytes: number
  linesProcessed: number
  done: boolean
}

export interface TimeSeriesBucket {
  ts: number // bucket start (epoch ms)
  counts: Partial<Record<LogLevel, number>>
}

export interface ErrorCluster {
  message: string // normalized signature
  sample: string // one representative raw message
  count: number
  level: LogLevel
}

export interface StatsResult {
  timeSeries: TimeSeriesBucket[]
  bucketSizeMs: number
  levelTotals: Partial<Record<LogLevel, number>>
  topErrors: ErrorCluster[]
  totalLines: number
  durationMs: number
}

export interface MemoryUsage {
  rssMB: number
  heapUsedMB: number
  heapTotalMB: number
  mainRssMB: number
  totalRssMB: number
}

// The API surface exposed on `window.loglens` by the preload script.
export interface LogLensAPI {
  openDirectory(): Promise<{ dir: string; files: FileMeta[] } | null>
  listDirectory(dir: string): Promise<FileMeta[]>
  getMemory(): Promise<MemoryUsage>

  indexFile(path: string): Promise<IndexResult>
  cancelIndex(path: string): void
  onIndexProgress(cb: (p: { path: string; progress: IndexProgress }) => void): () => void

  readLines(
    path: string,
    start: number,
    count: number
  ): Promise<{ lines: string[]; truncated: boolean[] }>

  search(path: string, query: SearchQuery): Promise<SearchResult>
  cancelSearch(path: string): void
  onSearchProgress(cb: (p: { path: string; progress: SearchProgress }) => void): () => void

  stats(path: string, opts?: { bucketSizeMs?: number }): Promise<StatsResult>
  cancelStats(path: string): void
  onStatsProgress(cb: (p: { path: string; progress: StatsProgress }) => void): () => void

  captureScreenshot(name: string): Promise<void>
  captureDone(): Promise<void>
}

declare global {
  interface Window {
    loglens: LogLensAPI
  }
}

// IPC channel names
export const CH = {
  openDirectory: 'loglens:openDirectory',
  listDirectory: 'loglens:listDirectory',
  getFileMeta: 'loglens:getFileMeta',
  indexFile: 'loglens:indexFile',
  cancelIndex: 'loglens:cancelIndex',
  readLines: 'loglens:readLines',
  search: 'loglens:search',
  cancelSearch: 'loglens:cancelSearch',
  stats: 'loglens:stats',
  cancelStats: 'loglens:cancelStats',
  getMemory: 'loglens:getMemory',
  captureScreenshot: 'loglens:captureScreenshot',
  captureDone: 'loglens:captureDone',
  // main -> renderer events
  evIndexProgress: 'loglens:ev:indexProgress',
  evSearchProgress: 'loglens:ev:searchProgress',
  evStatsProgress: 'loglens:ev:statsProgress'
} as const
