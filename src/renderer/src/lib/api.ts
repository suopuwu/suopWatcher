import type { Site, ScanAction, DiffResult, HistoryEntry, UniqueSnapshot, SearchResult, ScanResult } from '../types'

const w = window as Window & {
  api: {
    shell: {
      open: (url: string) => Promise<void>
    }
    settings: {
      get: (key: string) => Promise<unknown>
      set: (key: string, value: unknown) => Promise<void>
    }
    window: {
      minimize: () => void
      maximize: () => void
      close: () => void
    }
    sites: {
      list: () => Promise<Site[]>
      add: (url: string, name?: string) => Promise<Site>
      delete: (id: number) => Promise<void>
      update: (id: number, scan_delay: number, actions: ScanAction[]) => Promise<void>
    }
    scan: {
      run: (siteId?: number) => Promise<ScanResult[]>
      getConfig: (siteId: number) => Promise<{ url: string; scan_delay: number; actions: ScanAction[] }>
      process: (siteId: number, html: string, error?: string) => Promise<ScanResult>
    }
    snapshots: {
      diff: (siteId: number) => Promise<DiffResult | null>
      history: (siteId: number) => Promise<HistoryEntry[]>
      uniqueHistory: (siteId: number) => Promise<UniqueSnapshot[]>
      search: (siteId: number, pattern: string, isRegex: boolean) => Promise<SearchResult[] | { error: string }>
    }
  }
}

export const api = w.api
