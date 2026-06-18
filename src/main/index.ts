import { app, BrowserWindow, shell, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDb, getDb } from './db'
import { registerIpcHandlers } from './ipc'

function createWindow(): void {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('native_frame') as { value: string } | undefined
  const useNativeFrame: boolean = row ? JSON.parse(row.value) : true

  const icon = nativeImage.createFromPath(
    is.dev ? join(app.getAppPath(), 'build/icon.png') : join(__dirname, '../../build/icon.png')
  )

  const win = new BrowserWindow({
    width: 1200,
    height: 720,
    minWidth: 820,
    minHeight: 500,
    show: false,
    frame: useNativeFrame,
    icon,
    ...(useNativeFrame ? { backgroundColor: '#1a1b1e' } : { transparent: true }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true
    }
  })

  win.removeMenu()
  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.suopwatcher')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDb()
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
