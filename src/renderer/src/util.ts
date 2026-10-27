import type { LogLevel } from '../../shared/types'

// Lightweight level detection for coloring the browse view (renderer side).
const LEVEL_RE =
  /(?:^|[\s:\-=,|[\]])(TRACE|DEBUG|INFO|NOTICE|WARNING|WARN|ERROR|ERR|FATAL|CRITICAL|SEVERE)(?:$|[\s:\-=,|[\]])/i
const ALIAS: Record<string, LogLevel> = {
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
  SEVERE: 'FATAL'
}

export function detectLevelFast(line: string): LogLevel {
  const m = line.slice(0, 120).match(LEVEL_RE)
  return m ? ALIAS[m[1].toUpperCase()] ?? 'UNKNOWN' : 'UNKNOWN'
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n
  let i = -1
  do {
    v /= 1024
    i++
  } while (v >= 1024 && i < units.length - 1)
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

export function formatTime(ms: number): string {
  const d = new Date(ms)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export const LEVEL_COLORS: Record<LogLevel, string> = {
  TRACE: '#8b949e',
  DEBUG: '#7aa2f7',
  INFO: '#3fb950',
  WARN: '#d29922',
  ERROR: '#f85149',
  FATAL: '#ff7b72',
  UNKNOWN: '#8b949e'
}

export const LEVEL_BG: Record<LogLevel, string> = {
  TRACE: 'rgba(139,148,158,0.12)',
  DEBUG: 'rgba(122,162,247,0.12)',
  INFO: 'rgba(63,185,80,0.12)',
  WARN: 'rgba(210,153,34,0.14)',
  ERROR: 'rgba(248,81,73,0.16)',
  FATAL: 'rgba(255,123,114,0.18)',
  UNKNOWN: 'rgba(139,148,158,0.12)'
}
