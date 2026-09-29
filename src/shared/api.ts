/**
 * The small, typed bridge the preload script exposes to the renderer as `window.fiefdom`.
 * The renderer never touches Node or the filesystem directly.
 */
export interface AppInfo {
  version: string
  dataDir: string
  platform: string
}

export interface FiefdomBridge {
  /** Returns the saved ledger JSON, or null when nothing has been saved yet. */
  loadLedger(): Promise<string | null>
  /** Persists the ledger JSON (atomic write, with a daily backup of the previous file). */
  saveLedger(json: string): Promise<void>
  /** Synchronous save, used only while the window is closing. */
  saveLedgerSync(json: string): boolean
  /** Opens the folder that holds the ledger and its backups. */
  revealLedger(): Promise<void>
  appInfo(): Promise<AppInfo>
}
