export interface Site {
  id: number
  url: string
  name: string | null
  created_at: number
  last_scanned: number | null
  last_error: string | null
  has_changes: 0 | 1
}

export interface Snapshot {
  id: number
  website_id: number
  content: string
  content_hash: string
  scanned_at: number
  error: string | null
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  value: string
  count: number
}

export interface DiffResult {
  hasChanges: boolean
  latest: Snapshot
  previous: Snapshot | null
  diff: DiffLine[]
}

export interface HistoryEntry {
  id: number
  scanned_at: number
  content_hash: string
  error: string | null
}

export interface SearchMatch {
  start: number
  end: number
}

export interface SearchResult {
  line: number
  content: string
  matches: SearchMatch[]
}

export interface ScanResult {
  siteId: number
  url: string
  success: boolean
  hasChanges: boolean
  error?: string
}
