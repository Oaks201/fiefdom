import { app, BrowserWindow, ipcMain, Menu, screen, shell, type Rectangle } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import icon from '../../resources/icon.png?asset'
import type { AppInfo } from '../shared/api'
import { registerHealthIpc } from './healthIpc'
import { CampaignFile, LedgerFile } from './ledgerFile'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null
let ledger: LedgerFile
let campaign: CampaignFile

// ---------------------------------------------------------------------------
// Window size & position are remembered between launches.
// ---------------------------------------------------------------------------
interface WindowState {
  bounds?: Rectangle
  maximized?: boolean
}

function windowStateFile(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function readWindowState(): WindowState {
  try {
    const state = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8')) as WindowState
    const b = state.bounds
    if (!b) return state
    // Only reuse the position if it is still on a connected display.
    const visible = screen.getAllDisplays().some(({ workArea: w }) => {
      return b.x < w.x + w.width - 80 && b.x + b.width > w.x + 80 && b.y >= w.y - 20 && b.y < w.y + w.height - 80
    })
    return visible ? state : { maximized: state.maximized }
  } catch {
    return {}
  }
}

function writeWindowState(win: BrowserWindow): void {
  try {
    const state: WindowState = { bounds: win.getNormalBounds(), maximized: win.isMaximized() }
    fs.writeFileSync(windowStateFile(), JSON.stringify(state))
  } catch {
    /* not important enough to surface */
  }
}

// ---------------------------------------------------------------------------

function createWindow(): void {
  const saved = readWindowState()
  const win = new BrowserWindow({
    width: saved.bounds?.width ?? 1360,
    height: saved.bounds?.height ?? 880,
    x: saved.bounds?.x,
    y: saved.bounds?.y,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Fiefdom',
    backgroundColor: '#1a0f08',
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      // the music starts with the app, without waiting for a click
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  mainWindow = win

  win.once('ready-to-show', () => {
    if (saved.maximized) win.maximize()
    win.show()
  })
  win.on('close', () => writeWindowState(win))
  win.on('closed', () => {
    mainWindow = null
  })

  // Links never open inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  // Zoom, fullscreen and (in development) devtools, without needing a menu bar.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = input.control || input.meta
    const wc = win.webContents
    if (mod && (input.key === '=' || input.key === '+')) {
      wc.setZoomFactor(Math.min(2, wc.getZoomFactor() + 0.1))
      event.preventDefault()
    } else if (mod && input.key === '-') {
      wc.setZoomFactor(Math.max(0.6, wc.getZoomFactor() - 0.1))
      event.preventDefault()
    } else if (mod && input.key === '0') {
      wc.setZoomFactor(1)
      event.preventDefault()
    } else if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen())
      event.preventDefault()
    } else if (isDev && (input.key === 'F12' || (mod && input.shift && input.key.toLowerCase() === 'i'))) {
      wc.toggleDevTools()
      event.preventDefault()
    } else if (isDev && mod && input.key.toLowerCase() === 'r') {
      wc.reload()
      event.preventDefault()
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

function registerIpc(): void {
  ipcMain.handle('ledger:load', () => ledger.load())

  ipcMain.handle('ledger:save', async (_event, json: unknown) => {
    if (typeof json !== 'string') throw new Error('Ledger must be a string')
    await ledger.save(json)
  })

  ipcMain.on('ledger:save-sync', (event, json: unknown) => {
    try {
      if (typeof json !== 'string') throw new Error('Ledger must be a string')
      ledger.saveSync(json)
      event.returnValue = true
    } catch {
      event.returnValue = false
    }
  })

  ipcMain.handle('campaign:load', () => campaign.load())

  ipcMain.handle('campaign:save', async (_event, json: unknown) => {
    if (typeof json !== 'string') throw new Error('Campaign must be a string')
    await campaign.save(json)
  })

  ipcMain.on('campaign:save-sync', (event, json: unknown) => {
    try {
      if (typeof json !== 'string') throw new Error('Campaign must be a string')
      campaign.saveSync(json)
      event.returnValue = true
    } catch {
      event.returnValue = false
    }
  })

  ipcMain.handle('ledger:reveal', async () => {
    fs.mkdirSync(ledger.dir, { recursive: true })
    await shell.openPath(ledger.dir)
  })

  ipcMain.handle('app:info', (): AppInfo => ({
    version: app.getVersion(),
    dataDir: ledger.dir,
    platform: process.platform
  }))
}

// One running copy at a time, so two windows can never overwrite each other's saves.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.fiefdom.app')
    if (!isDev) Menu.setApplicationMenu(null)

    // FIEFDOM_DATA_DIR lets you point the app at a different ledger (handy for testing).
    const dataDir = process.env['FIEFDOM_DATA_DIR']?.trim() || app.getPath('userData')
    ledger = new LedgerFile(dataDir)
    // the game's state sits beside the ledger (A-08)
    campaign = new CampaignFile(dataDir)

    registerIpc()
    // Fitbit (through the Google Health API); its connection is kept beside the ledger
    registerHealthIpc(dataDir, () => mainWindow)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
