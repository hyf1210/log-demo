import { app, dialog, ipcMain } from 'electron'
import { readdir, stat } from 'fs/promises'
import { join, extname } from 'path'
import {
  CH,
  type FileMeta,
  type MemoryUsage,
  type SearchQuery,
  type SearchResult,
  type StatsResult
} from '../shared/types'
import { buildLineIndex } from './indexer'
import { getIndex, setIndex, dropIndex } from './indexStore'
import { readLines } from './reader'
import { searchFile } from './searcher'
import { computeStats } from './stats'
import { CancelledError, type TaskSignal } from './scan'

const LOG_EXTS = new Set(['.log', '.txt'])

// Active task signals, keyed for cancellation.
const activeSignals = new Map<string, TaskSignal>()

function registerSignal(key: string): TaskSignal {
  const sig: TaskSignal = { aborted: false }
  activeSignals.set(key, sig)
  return sig
}

function releaseSignal(key: string): void {
  activeSignals.delete(key)
}

async function listDirectory(dir: string): Promise<FileMeta[]> {
  const entries = await readdir(dir)
  const metas: FileMeta[] = []
  for (const name of entries) {
    const ext = extname(name).toLowerCase()
    if (!LOG_EXTS.has(ext)) continue
    const full = join(dir, name)
    try {
      const st = await stat(full)
      if (!st.isFile()) continue
      metas.push({ path: full, name, size: st.size, mtime: st.mtimeMs })
    } catch {
      // skip unreadable files
    }
  }
  metas.sort((a, b) => b.mtime - a.mtime)
  return metas
}

function memoryUsage(): MemoryUsage {
  const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10
  const kb = (n: number) => Math.round((n / 1024) * 10) / 10
  const main = process.memoryUsage()
  let total = 0
  try {
    // workingSetSize is reported in kilobytes by Electron
    for (const m of app.getAppMetrics()) total += m.memory?.workingSetSize ?? 0
  } catch {
    total = main.rss / 1024
  }
  return {
    rssMB: mb(main.rss),
    heapUsedMB: mb(main.heapUsed),
    heapTotalMB: mb(main.heapTotal),
    mainRssMB: mb(main.rss),
    totalRssMB: kb(total)
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(CH.openDirectory, async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths.length) return null
    const dir = r.filePaths[0]
    return { dir, files: await listDirectory(dir) }
  })

  ipcMain.handle(CH.listDirectory, async (_e, dir: string) => {
    return listDirectory(dir)
  })

  ipcMain.handle(CH.getMemory, () => memoryUsage())

  // --- indexing -----------------------------------------------------------
  ipcMain.handle(CH.indexFile, async (event, path: string) => {
    const cached = getIndex(path)
    if (cached) return { path, lineCount: cached.lineCount, durationMs: 0 }

    const key = `index:${path}`
    const sig = registerSignal(key)
    try {
      const st = await stat(path)
      const index = await buildLineIndex(path, st.size, {
        signal: sig,
        onProgress: (p) => {
          if (!event.sender.isDestroyed()) event.sender.send(CH.evIndexProgress, { path, progress: p })
        }
      })
      setIndex(path, index)
      return { path, lineCount: index.lineCount, durationMs: 0 }
    } catch (e) {
      dropIndex(path)
      throw e
    } finally {
      releaseSignal(key)
    }
  })

  ipcMain.on(CH.cancelIndex, (_e, path: string) => {
    const sig = activeSignals.get(`index:${path}`)
    if (sig) sig.aborted = true
  })

  // --- reading lines ------------------------------------------------------
  ipcMain.handle(CH.readLines, async (_e, path: string, start: number, count: number) => {
    const index = getIndex(path)
    if (!index) throw new Error('file not indexed')
    return readLines(index, start, count)
  })

  // --- search -------------------------------------------------------------
  ipcMain.handle(CH.search, async (event, path: string, query: SearchQuery): Promise<SearchResult> => {
    const key = `search:${path}`
    const sig = registerSignal(key)
    try {
      return await searchFile(path, query, {
        signal: sig,
        onProgress: (p) => {
          if (!event.sender.isDestroyed()) event.sender.send(CH.evSearchProgress, { path, progress: p })
        }
      })
    } finally {
      releaseSignal(key)
    }
  })

  ipcMain.on(CH.cancelSearch, (_e, path: string) => {
    const sig = activeSignals.get(`search:${path}`)
    if (sig) sig.aborted = true
  })

  // --- statistics ---------------------------------------------------------
  ipcMain.handle(CH.stats, async (event, path: string, opts?: { bucketSizeMs?: number }): Promise<StatsResult> => {
    const key = `stats:${path}`
    const sig = registerSignal(key)
    try {
      return await computeStats(path, {
        signal: sig,
        bucketSizeMs: opts?.bucketSizeMs,
        onProgress: (p) => {
          if (!event.sender.isDestroyed()) event.sender.send(CH.evStatsProgress, { path, progress: p })
        }
      })
    } finally {
      releaseSignal(key)
    }
  })

  ipcMain.on(CH.cancelStats, (_e, path: string) => {
    const sig = activeSignals.get(`stats:${path}`)
    if (sig) sig.aborted = true
  })
}

export function cleanup(): void {
  for (const sig of activeSignals.values()) sig.aborted = true
  activeSignals.clear()
}

export { CancelledError }
