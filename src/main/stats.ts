import { stat } from 'fs/promises'
import type {
  ErrorCluster,
  LogLevel,
  StatsProgress,
  StatsResult,
  TimeSeriesBucket
} from '../shared/types'
import { forEachLine, type TaskSignal } from './scan'
import { normalizeMessage, parseLinePrefix } from './logparse'

export interface StatsOptions {
  signal?: TaskSignal
  chunkSize?: number
  bucketSizeMs?: number // default 60_000 (1 minute)
  maxBuckets?: number // down-sample if exceeded
  topErrors?: number
  onProgress?: (p: StatsProgress) => void
}

const DEFAULT_BUCKET_MS = 60_000
const DEFAULT_MAX_BUCKETS = 1200
const MAX_DISTINCT_ERRORS = 5000

/**
 * Single streaming pass over the file to build:
 *  1. a time-series histogram of log levels (line/bar chart)
 *  2. per-level totals
 *  3. Top-N error message clusters (signature-normalized, capped to bound memory)
 */
export async function computeStats(filePath: string, opts: StatsOptions = {}): Promise<StatsResult> {
  const { size } = await stat(filePath)
  const started = Date.now()

  const bucketMs = opts.bucketSizeMs ?? DEFAULT_BUCKET_MS
  const maxBuckets = opts.maxBuckets ?? DEFAULT_MAX_BUCKETS
  const topErrors = opts.topErrors ?? 20

  // time bucket -> level -> count
  const hist = new Map<number, Map<LogLevel, number>>()
  const levelTotals: Partial<Record<LogLevel, number>> = {}
  // normalized signature -> cluster
  const errors = new Map<string, ErrorCluster>()
  let totalLines = 0

  const bump = (m: Map<LogLevel, number>, lvl: LogLevel) => {
    m.set(lvl, (m.get(lvl) ?? 0) + 1)
  }

  await forEachLine(
    filePath,
    size,
    (line) => {
      totalLines++
      const { level, timestamp } = parseLinePrefix(line.text)
      levelTotals[level] = (levelTotals[level] ?? 0) + 1

      if (timestamp !== undefined) {
        const bucket = Math.floor(timestamp / bucketMs) * bucketMs
        let m = hist.get(bucket)
        if (!m) {
          m = new Map()
          hist.set(bucket, m)
        }
        bump(m, level)
      }

      if (level === 'ERROR' || level === 'FATAL') {
        // cluster on the message portion (strip leading level/timestamp/logger)
        const msg = line.text
          .replace(/^[^\]]*\]\s*/, '')
          .replace(/^(?:TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|ERR|FATAL|CRITICAL|SEVERE)\s+(?:[a-zA-Z0-9_.$-]+)\s*-\s*/i, '')
          .trim()
        const sig = normalizeMessage(msg)
        if (!sig) return
        let c = errors.get(sig)
        if (!c) {
          if (errors.size >= MAX_DISTINCT_ERRORS) return
          c = { message: sig, sample: msg.slice(0, 400), count: 0, level }
          errors.set(sig, c)
        }
        c.count++
      }
    },
    {
      signal: opts.signal,
      chunkSize: opts.chunkSize,
      onProgress: (bytesScanned) =>
        opts.onProgress?.({ bytesScanned, totalBytes: size, linesProcessed: totalLines, done: false })
    }
  )

  // Build sorted time series, down-sampling if there are too many buckets.
  let buckets = [...hist.keys()].sort((a, b) => a - b)
  let effectiveBucketMs = bucketMs
  let factor = 1
  while (buckets.length > maxBuckets && effectiveBucketMs < 24 * 3600 * 1000) {
    factor *= 2
    effectiveBucketMs = bucketMs * factor
    const merged = new Map<number, Map<LogLevel, number>>()
    for (const [b, m] of hist) {
      const nb = Math.floor(b / effectiveBucketMs) * effectiveBucketMs
      let mm = merged.get(nb)
      if (!mm) {
        mm = new Map()
        merged.set(nb, mm)
      }
      for (const [lvl, n] of m) bump(mm, lvl)
    }
    hist.clear()
    for (const [b, m] of merged) hist.set(b, m)
    buckets = [...hist.keys()].sort((a, b) => a - b)
  }

  const timeSeries: TimeSeriesBucket[] = buckets.map((ts) => {
    const m = hist.get(ts)!
    const counts: Partial<Record<LogLevel, number>> = {}
    for (const [lvl, n] of m) counts[lvl] = n
    return { ts, counts }
  })

  const topErrorList = [...errors.values()].sort((a, b) => b.count - a.count).slice(0, topErrors)

  opts.onProgress?.({ bytesScanned: size, totalBytes: size, linesProcessed: totalLines, done: true })

  return {
    timeSeries,
    bucketSizeMs: effectiveBucketMs,
    levelTotals,
    topErrors: topErrorList,
    totalLines,
    durationMs: Date.now() - started
  }
}
