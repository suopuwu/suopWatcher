import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  sites: {
    list: () => ipcRenderer.invoke('sites:list'),
    add: (url: string, name?: string) => ipcRenderer.invoke('sites:add', { url, name }),
    delete: (id: number) => ipcRenderer.invoke('sites:delete', { id })
  },
  scan: {
    run: (siteId?: number) => ipcRenderer.invoke('scan:run', { siteId })
  },
  snapshots: {
    diff: (siteId: number) => ipcRenderer.invoke('snapshots:diff', { siteId }),
    history: (siteId: number) => ipcRenderer.invoke('snapshots:history', { siteId }),
    search: (siteId: number, pattern: string, isRegex: boolean) =>
      ipcRenderer.invoke('snapshots:search', { siteId, pattern, isRegex })
  }
})
