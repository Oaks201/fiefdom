/**
 * Wires the Google Health client into Electron: secrets encrypted with the operating system's
 * keychain (safeStorage — DPAPI on Windows), the client file picked through a native dialog,
 * and the browser opened for Google's consent page. The renderer only ever sees HealthStatus.
 */
import { dialog, ipcMain, net, safeStorage, shell, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { HealthService, type ClientConfig, type HealthStore, type StoredHealth } from './health'

type Sealed = { enc: string } | { plain: string }

interface HealthFile {
  version: 1
  client?: { clientId: string; authUri: string; tokenUri: string; clientSecret: Sealed }
  refreshToken?: Sealed
  scopes?: string[]
  problem?: string
}

/** On Linux without a keyring, Electron can only pretend to encrypt; say so honestly. */
function osEncryption(): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false
    if (process.platform === 'linux') {
      const backend = safeStorage.getSelectedStorageBackend?.()
      if (backend === 'basic_text' || backend === 'unknown') return false
    }
    return true
  } catch {
    return false
  }
}

export function createHealthStore(dir: string): HealthStore {
  const file = path.join(dir, 'health.json')
  const encrypted = osEncryption()

  const seal = (value: string): Sealed => (encrypted ? { enc: safeStorage.encryptString(value).toString('base64') } : { plain: value })
  const open = (sealed: unknown): string | undefined => {
    if (typeof sealed !== 'object' || sealed === null) return undefined
    const s = sealed as Record<string, unknown>
    if (typeof s.plain === 'string') return s.plain
    if (typeof s.enc === 'string') {
      try {
        return safeStorage.decryptString(Buffer.from(s.enc, 'base64'))
      } catch {
        return undefined // written by another user or machine: treat as absent
      }
    }
    return undefined
  }

  return {
    encrypted,
    read(): StoredHealth {
      let raw: HealthFile
      try {
        raw = JSON.parse(fs.readFileSync(file, 'utf8')) as HealthFile
      } catch {
        return {}
      }
      const out: StoredHealth = {}
      const c = raw.client
      const secret = c ? open(c.clientSecret) : undefined
      if (c && secret && typeof c.clientId === 'string' && typeof c.authUri === 'string' && typeof c.tokenUri === 'string') {
        const client: ClientConfig = { clientId: c.clientId, clientSecret: secret, authUri: c.authUri, tokenUri: c.tokenUri }
        out.client = client
        const token = open(raw.refreshToken)
        if (token) out.refreshToken = token
        if (Array.isArray(raw.scopes)) out.scopes = raw.scopes.filter((x): x is string => typeof x === 'string')
      }
      if (typeof raw.problem === 'string') out.problem = raw.problem
      return out
    },
    write(data: StoredHealth): void {
      const body: HealthFile = { version: 1 }
      if (data.client) {
        const { clientId, authUri, tokenUri, clientSecret } = data.client
        body.client = { clientId, authUri, tokenUri, clientSecret: seal(clientSecret) }
      }
      if (data.refreshToken) body.refreshToken = seal(data.refreshToken)
      if (data.scopes) body.scopes = data.scopes
      if (data.problem) body.problem = data.problem
      fs.mkdirSync(dir, { recursive: true })
      const json = JSON.stringify(body, null, 2)
      const tmp = `${file}.tmp`
      fs.writeFileSync(tmp, json, { encoding: 'utf8', mode: 0o600 })
      try {
        fs.renameSync(tmp, file)
      } catch {
        // antivirus can hold a file for a moment on Windows; write it directly instead
        fs.writeFileSync(file, json, { encoding: 'utf8', mode: 0o600 })
        fs.rmSync(tmp, { force: true })
      }
    }
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function registerHealthIpc(dataDir: string, getWindow: () => BrowserWindow | null): HealthService {
  const service = new HealthService({
    fetch: (input, init) => net.fetch(input instanceof URL ? input.toString() : (input as string), init),
    openExternal: (url) => shell.openExternal(url),
    store: createHealthStore(dataDir),
    // FIEFDOM_HEALTH_API_BASE points the app at a stand-in for Google (for testing)
    apiBase: process.env['FIEFDOM_HEALTH_API_BASE']?.trim() || undefined,
    onSignedIn: () => {
      const win = getWindow()
      if (!win) return
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  ipcMain.handle('health:status', () => service.status())

  ipcMain.handle('health:import-client', async () => {
    const win = getWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Load your Google OAuth client file',
      buttonLabel: 'Load',
      filters: [{ name: 'Google client file', extensions: ['json'] }],
      properties: ['openFile']
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const chosen = result.filePaths[0]
    if (result.canceled || !chosen) return service.status()
    const stat = fs.statSync(chosen)
    if (stat.size > 64 * 1024) throw new Error('That file is far too large to be a Google client file.')
    return service.setClient(fs.readFileSync(chosen, 'utf8'))
  })

  ipcMain.handle('health:connect', (_event, options: unknown) => {
    const nutrition = typeof options === 'object' && options !== null && (options as { nutrition?: unknown }).nutrition === true
    return service.connect({ nutrition })
  })

  ipcMain.handle('health:cancel-connect', () => service.cancelConnect())
  ipcMain.handle('health:disconnect', () => service.disconnect())
  ipcMain.handle('health:forget-client', () => service.forgetClient())

  ipcMain.handle('health:fetch', (_event, range: unknown) => {
    const r = typeof range === 'object' && range !== null ? (range as { start?: unknown; end?: unknown }) : {}
    if (typeof r.start !== 'string' || typeof r.end !== 'string' || !ISO.test(r.start) || !ISO.test(r.end)) {
      throw new Error('A range of dates is needed.')
    }
    return service.fetchDays(r.start, r.end)
  })

  return service
}
