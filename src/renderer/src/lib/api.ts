import type { Site, DiffResult, HistoryEntry, SearchResult, ScanResult } from '../types'

const w = window as Window & {
  api: {
    sites: {
      list: () => Promise<Site[]>
      add: (url: string, name?: string) => Promise<Site>
      delete: (id: number) => Promise<void>
    }
    scan: {
      run: (siteId?: number) => Promise<ScanResult[]>
    }
    snapshots: {
      diff: (siteId: number) => Promise<DiffResult | null>
      history: (siteId: number) => Promise<HistoryEntry[]>
      search: (siteId: number, pattern: string, isRegex: boolean) => Promise<SearchResult[] | { error: string }>
    }
  }
}

export const api = w.api
