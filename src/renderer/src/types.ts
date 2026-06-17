export interface Site {
  id: number
  url: string
  name: string | null
  created_at: number
  last_scanned: number | null
  last_error: string | null
  has_changes: 0 | 1
  scan_delay: number
  actions: string // JSON ScanAction[]
}

export interface ScanAction {
  type: 'wait' | 'click_selector' | 'click_text' | 'type' | 'key'
  ms?: number
  selector?: string
  text?: string
  key?: string
}

export interface Snapshot {
  id: number
  website_id: number
  content: string
  content_hash: string
  scanned_at: number
  raw_html: string
  error: string | null
}

export interface UniqueSnapshot {
  id: number
  scanned_at: number
  content_hash: string
  raw_html: string
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  value: string
  count: number
}

export interface WatchRule {
  id: number
  website_id: number
  label: string
  selector: string
  selector_type: 'css' | 'xpath'
  detect: string[]
  created_at: number
}

export interface RuleState {
  exists: boolean
  text: string
  childCount: number
  attrs: Record<string, string>
  regexCounts?: Record<string, number>
}

export interface RuleChange {
  rule: WatchRule
  previous: RuleState | null
  current: RuleState
  triggers: string[]
}

export interface ElementDescriptor {
  tag: string
  id: string | null
  classes: string[]
  simpleSelector: string
  cssPath: string
  xpath: string
  text: string
  childCount: number
  attrs: Record<string, string>
}

export interface DiffResult {
  hasChanges: boolean
  latest: Snapshot
  previous: Snapshot | null
  diff: DiffLine[]
  ruleChanges: RuleChange[]
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

export interface LogEntry {
  ts: number
  site: string
  hasChanges: boolean
  error?: string
}
