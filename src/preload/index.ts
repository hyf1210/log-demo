import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  CH,
  type FileMeta,
  type IndexProgress,
  type IndexResult,
  type LogLensAPI,
  type MemoryUsage,
  type SearchProgress,
  type SearchQuery,
  type SearchResult,
  type StatsProgress,
  type StatsResult
} from '../shared/types'

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: LogLensAPI = {
  openDirectory: (): Promise<{ dir: string; files: FileMeta[] } | null> =>
    ipcRenderer.invoke(CH.openDirectory),
  listDirectory: (dir: string): Promise<FileMeta[]> => ipcRenderer.invoke(CH.listDirectory, dir),
  getMemory: (): Promise<MemoryUsage> => ipcRenderer.invoke(CH.getMemory),

  indexFile: (path: string): Promise<IndexResult> => ipcRenderer.invoke(CH.indexFile, path),
  cancelIndex: (path: string): void => ipcRenderer.send(CH.cancelIndex, path),
  onIndexProgress: (cb: (p: { path: string; progress: IndexProgress }) => void) =>
    on(CH.evIndexProgress, cb),

  readLines: (
    path: string,
    start: number,
    count: number
  ): Promise<{ lines: string[]; truncated: boolean[] }> =>
    ipcRenderer.invoke(CH.readLines, path, start, count),

  search: (path: string, query: SearchQuery): Promise<SearchResult> =>
    ipcRenderer.invoke(CH.search, path, query),
  cancelSearch: (path: string): void => ipcRenderer.send(CH.cancelSearch, path),
  onSearchProgress: (cb: (p: { path: string; progress: SearchProgress }) => void) =>
    on(CH.evSearchProgress, cb),

  stats: (path: string, opts?: { bucketSizeMs?: number }): Promise<StatsResult> =>
    ipcRenderer.invoke(CH.stats, path, opts),
  cancelStats: (path: string): void => ipcRenderer.send(CH.cancelStats, path),
  onStatsProgress: (cb: (p: { path: string; progress: StatsProgress }) => void) =>
    on(CH.evStatsProgress, cb),

  captureScreenshot: (name: string): Promise<void> =>
    ipcRenderer.invoke(CH.captureScreenshot, name),
  captureDone: (): Promise<void> => ipcRenderer.invoke(CH.captureDone)
}

contextBridge.exposeInMainWorld('loglens', api)
