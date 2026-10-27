import type { LogLevel } from '../shared/types'

// Heuristic log-level and timestamp detection used by search and statistics.
// Detection only looks at the first ~200 bytes of a line, which is where
// timestamps and levels live in the vast majority of log formats.

const PREFIX_LEN = 200

const LEVEL_PATTERN =
  /(?:^|[\s:\-=,|[\]])(TRACE|DEBUG|INFO|NOTICE|WARNING|WARN|ERROR|ERR|FATAL|CRITICAL|SEVERE|FINEST|FINER|FINE)(?:$|[\s:\-=,|[\]])/i

const LEVEL_ALIAS: Record<string, LogLevel> = {
  TRACE: 'TRACE',
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  NOTICE: 'INFO',
  WARN: 'WARN',
  WARNING: 'WARN',
  ERROR: 'ERROR',
  ERR: 'ERROR',
  FATAL: 'FATAL',
  CRITICAL: 'FATAL',
  SEVERE: 'FATAL',
  FINE: 'DEBUG',
  FINER: 'DEBUG',
  FINEST: 'DEBUG'
}

// ISO-ish timestamps: 2024-01-15T10:30:00.123Z / 2024/01/15 10:30:00 / 2024-01-15 10:30:00,123+08:00
const TS_ISO =
  /(\d{4}[-/]\d{1,2}[-/]\d{1,2}[T ]\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?)/

// Epoch millis (13 digits) or seconds (10 digits), from year 2001 onward (starts with '1').
const TS_EPOCH = /(?:^|[^\d])(1\d{9}|1\d{12})(?:[^\d]|$)/

export function detectLevel(prefix: string): LogLevel {
  const m = prefix.match(LEVEL_PATTERN)
  if (!m) return 'UNKNOWN'
  return LEVEL_ALIAS[m[1].toUpperCase()] ?? 'UNKNOWN'
}

/** Parse a timestamp to epoch millis, or undefined if none found. */
export function detectTimestamp(prefix: string): number | undefined {
  const iso = prefix.match(TS_ISO)
  if (iso) {
    const t = Date.parse(iso[1])
    if (!Number.isNaN(t)) return t
  }
  const epoch = prefix.match(TS_EPOCH)
  if (epoch) {
    const n = Number(epoch[1])
    // 10 digits -> seconds, 13 digits -> millis
    const t = epoch[1].length === 10 ? n * 1000 : n
    if (t > 0 && t < 8_640_000_000_000) return t
  }
  return undefined
}

export function parseLinePrefix(line: string): { level: LogLevel; timestamp?: number } {
  const prefix = line.length > PREFIX_LEN ? line.slice(0, PREFIX_LEN) : line
  return { level: detectLevel(prefix), timestamp: detectTimestamp(prefix) }
}

/**
 * Normalize an error message into a stable signature for clustering:
 * lowercase, collapse whitespace, and replace variable parts
 * (numbers, uuids, hex, paths, ip addresses, quoted strings) with placeholders.
 */
export function normalizeMessage(msg: string): string {
  return msg
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '<uuid>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<ip>')
    .replace(/[a-z]:[\\/][^\s"']+/gi, '<path>')
    .replace(/\/[^\s"']+/g, '<path>')
    .replace(/\b0x[0-9a-f]+\b/g, '<hex>')
    .replace(/\d+/g, '<n>')
    .replace(/"[^"]*"/g, '<str>')
    .replace(/'[^']*'/g, '<str>')
    .replace(/\[[^\]\s]+\]/g, '[]')
    .replace(/\s+/g, ' ')
    .trim()
}
