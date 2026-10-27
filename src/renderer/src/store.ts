import { useSyncExternalStore } from 'react'
import type {
  FileMeta,
  IndexProgress,
  MemoryUsage,
  SearchProgress,
  SearchQuery,
  SearchResult,
  StatsProgress,
  StatsResult
} from '../../shared/types'

export interface ActiveFile {
  path: string
  indexed: boolean
  lineCount?: number
}

export interface AppState {
  dir: string | null
  files: FileMeta[]
  activeFile: ActiveFile | null

  indexing: boolean
  indexProgress: IndexProgress | null

  searching: boolean
  searchProgress: SearchProgress | null
  searchResult: SearchResult | null
  searchQuery: SearchQuery
  searchApplied: boolean

  statsLoading: boolean
  statsProgress: StatsProgress | null
  statsResult: StatsResult | null

  view: 'log' | 'stats'
  memory: MemoryUsage | null
}

const initialState: AppState = {
  dir: null,
  files: [],
  activeFile: null,
  indexing: false,
  indexProgress: null,
  searching: false,
  searchProgress: null,
  searchResult: null,
  searchQuery: { levels: [], caseSensitive: false, regex: false },
  searchApplied: false,
  statsLoading: false,
  statsProgress: null,
  statsResult: null,
  view: 'log',
  memory: null
}

let state: AppState = { ...initialState }
let version = 0
const listeners = new Set<() => void>()

function setState(patch: Partial<AppState>): void {
  Object.assign(state, patch)
  version++
  listeners.forEach((l) => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function getState(): AppState {
  return state
}

export function useAppState(): AppState {
  useSyncExternalStore(subscribe, () => version)
  return state
}

// --- actions -------------------------------------------------------------

export async function openDir(): Promise<void> {
  const res = await window.loglens.openDirectory()
  if (!res) return
  setState({ dir: res.dir, files: res.files, activeFile: null, searchResult: null, statsResult: null })
}

export async function loadDir(dir: string): Promise<void> {
  const files = await window.loglens.listDirectory(dir)
  setState({ dir, files, activeFile: null, searchResult: null, statsResult: null })
}

export async function openFile(path: string): Promise<void> {
  setState({
    activeFile: { path, indexed: false },
    indexing: true,
    indexProgress: null,
    searchResult: null,
    searchApplied: false,
    statsResult: null,
    view: 'log'
  })
  try {
    const res = await window.loglens.indexFile(path)
    setState({
      activeFile: { path, indexed: true, lineCount: res.lineCount },
      indexing: false,
      indexProgress: null
    })
    // update file meta lineCount
    const files = state.files.map((f) => (f.path === path ? { ...f, lineCount: res.lineCount } : f))
    setState({ files })
  } catch (e) {
    setState({ indexing: false, indexProgress: null })
    console.error('index failed', e)
  }
}

export function cancelIndex(): void {
  if (state.activeFile) window.loglens.cancelIndex(state.activeFile.path)
}

export function setSearchQuery(patch: Partial<SearchQuery>): void {
  setState({ searchQuery: { ...state.searchQuery, ...patch } })
}

export async function runSearch(): Promise<void> {
  const path = state.activeFile?.path
  if (!path) return
  setState({ searching: true, searchProgress: null, searchResult: null, searchApplied: false, view: 'log' })
  try {
    const res = await window.loglens.search(path, state.searchQuery)
    setState({ searching: false, searchProgress: null, searchResult: res, searchApplied: true })
  } catch (e) {
    setState({ searching: false, searchProgress: null })
    console.error('search failed', e)
  }
}

export function cancelSearch(): void {
  if (state.activeFile) window.loglens.cancelSearch(state.activeFile.path)
}

export function clearSearch(): void {
  setState({ searchResult: null, searchApplied: false, searchProgress: null })
}

export async function runStats(): Promise<void> {
  const path = state.activeFile?.path
  if (!path) return
  setState({ statsLoading: true, statsProgress: null, statsResult: null, view: 'stats' })
  try {
    const res = await window.loglens.stats(path)
    setState({ statsLoading: false, statsProgress: null, statsResult: res })
  } catch (e) {
    setState({ statsLoading: false, statsProgress: null })
    console.error('stats failed', e)
  }
}

export function cancelStats(): void {
  if (state.activeFile) window.loglens.cancelStats(state.activeFile.path)
}

export function setView(view: 'log' | 'stats'): void {
  setState({ view })
}

export async function refreshMemory(): Promise<void> {
  try {
    setState({ memory: await window.loglens.getMemory() })
  } catch {
    /* ignore */
  }
}

// --- wire up progress events once ----------------------------------------

export function initStore(): () => void {
  const offIndex = window.loglens.onIndexProgress(({ path, progress }) => {
    if (state.activeFile?.path === path) setState({ indexProgress: progress })
  })
  const offSearch = window.loglens.onSearchProgress(({ path, progress }) => {
    if (state.activeFile?.path === path) setState({ searchProgress: progress })
  })
  const offStats = window.loglens.onStatsProgress(({ path, progress }) => {
    if (state.activeFile?.path === path) setState({ statsProgress: progress })
  })
  return () => {
    offIndex()
    offSearch()
    offStats()
  }
}
