import type { LineIndex } from './indexer'

// In-memory cache of line-offset indexes, keyed by absolute file path.
// Kept for the lifetime of the app so re-opening a file is instant.
const cache = new Map<string, LineIndex>()

export function getIndex(path: string): LineIndex | undefined {
  return cache.get(path)
}

export function setIndex(path: string, index: LineIndex): void {
  cache.set(path, index)
}

export function dropIndex(path: string): void {
  cache.delete(path)
}

export function dropAll(): void {
  cache.clear()
}

export function indexSize(path: string): number | undefined {
  const idx = cache.get(path)
  return idx ? idx.lineCount : undefined
}
