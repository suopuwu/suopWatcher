import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  shell: {
    open: (url: string) => ipcRenderer.invoke('shell:open', { url })
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', { key }),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', { key, value })
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },
  sites: {
    list: () => ipcRenderer.invoke('sites:list'),
    add: (url: string, name?: string) => ipcRenderer.invoke('sites:add', { url, name }),
    delete: (id: number) => ipcRenderer.invoke('sites:delete', { id }),
    update: (id: number, scan_delay: number, actions: object[]) =>
      ipcRenderer.invoke('sites:update', { id, scan_delay, actions })
  },
  scan: {
    run: (siteId?: number) => ipcRenderer.invoke('scan:run', { siteId }),
    getConfig: (siteId: number) => ipcRenderer.invoke('scan:get-config', { siteId }),
    process: (siteId: number, html: string, error?: string) =>
      ipcRenderer.invoke('scan:process', { siteId, html, error })
  },
  snapshots: {
    diff: (siteId: number) => ipcRenderer.invoke('snapshots:diff', { siteId }),
    history: (siteId: number) => ipcRenderer.invoke('snapshots:history', { siteId }),
    uniqueHistory: (siteId: number) => ipcRenderer.invoke('snapshots:unique-history', { siteId }),
    search: (siteId: number, pattern: string, isRegex: boolean) =>
      ipcRenderer.invoke('snapshots:search', { siteId, pattern, isRegex })
  }
})
