import { stat } from 'fs/promises'
import type { SearchHit, SearchProgress, SearchQuery, SearchResult } from '../shared/types'
import { forEachLine, type TaskSignal } from './scan'
import { parseLinePrefix } from './logparse'

const PREVIEW_LEN = 300
const DEFAULT_MAX_RESULTS = 100_000

export interface SearchOptions {
  signal?: TaskSignal
  chunkSize?: number
  onProgress?: (p: SearchProgress) => void
}

/**
 * Stream the file line by line and collect lines matching keyword / level /
 * time-range filters. Reports progress and honors cancellation between chunks.
 * Results are capped to bound memory; `truncated` signals the cap was hit.
 */
export async function searchFile(
  filePath: string,
  query: SearchQuery,
  opts: SearchOptions = {}
): Promise<SearchResult> {
  const { size } = await stat(filePath)
  const started = Date.now()

  const keyword = query.keyword && query.keyword.length > 0 ? query.keyword : undefined
  const levels = query.levels && query.levels.length > 0 ? new Set(query.levels) : undefined
  const maxResults = query.maxResults ?? DEFAULT_MAX_RESULTS

  let regex: RegExp | null = null
  if (keyword) {
    try {
      regex = query.regex
        ? new RegExp(keyword, query.caseSensitive ? '' : 'i')
        : null
    } catch {
      regex = null
    }
  }
  const needle = keyword && !query.regex ? (query.caseSensitive ? keyword : keyword.toLowerCase()) : null

  const hits: SearchHit[] = []
  let truncated = false

  const matchKeyword = (text: string): boolean => {
    if (!keyword) return true
    if (regex) {
      regex.lastIndex = 0
      return regex.test(text)
    }
    const hay = query.caseSensitive ? text : text.toLowerCase()
    return hay.includes(needle as string)
  }

  await forEachLine(
    filePath,
    size,
    (line) => {
      if (truncated) return
      const { level, timestamp } = parseLinePrefix(line.text)
      if (levels && !levels.has(level)) return
      if (query.timeFrom !== undefined && (timestamp === undefined || timestamp < query.timeFrom)) return
      if (query.timeTo !== undefined && (timestamp === undefined || timestamp > query.timeTo)) return
      if (!matchKeyword(line.text)) return

      hits.push({
        line: line.index,
        timestamp,
        level,
        preview: line.text.length > PREVIEW_LEN ? line.text.slice(0, PREVIEW_LEN) + '…' : line.text
      })
      if (hits.length >= maxResults) truncated = true
    },
    {
      signal: opts.signal,
      chunkSize: opts.chunkSize,
      onProgress: (bytesScanned) =>
        opts.onProgress?.({ bytesScanned, totalBytes: size, matches: hits.length, done: false })
    }
  )

  opts.onProgress?.({ bytesScanned: size, totalBytes: size, matches: hits.length, done: true })
  return { hits, totalMatches: hits.length, truncated, durationMs: Date.now() - started }
}
