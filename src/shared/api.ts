/**
 * The small, typed bridge the preload script exposes to the renderer as `window.fiefdom`.
 * The renderer never touches Node or the filesystem directly — nor Google credentials.
 */
export interface AppInfo {
  version: string
  dataDir: string
  platform: string
}

/** What Fitbit (through the Google Health API) can fill in on a day. */
export type HealthMetric = 'steps' | 'eaten' | 'calories'

export interface HealthStatus {
  /** a Google OAuth client file has been loaded */
  hasClient: boolean
  /** enough of the client ID to recognise it — never the secret */
  clientHint: string | null
  /** Google has granted access and it is stored */
  connected: boolean
  /** what the granted access can read */
  metrics: HealthMetric[]
  /** set when the connection needs attention: expired, revoked, refused… */
  problem: string | null
  /** stored secrets are encrypted by the operating system */
  encrypted: boolean
  /** a sign-in is waiting in the browser */
  connecting: boolean
}

export interface HealthPoint {
  /** local calendar date, YYYY-MM-DD */
  date: string
  metric: HealthMetric
  value: number
}

export interface HealthFetchResult {
  points: HealthPoint[]
  /** metrics that could not be read this time, and why */
  errors: Partial<Record<HealthMetric, string>>
  status: HealthStatus
}

export interface HealthBridge {
  status(): Promise<HealthStatus>
  /** Asks for the client_secret JSON downloaded from Google Cloud Console (a file dialog in the main process). */
  importClient(): Promise<HealthStatus>
  /** Opens Google's consent page in the browser and waits for the answer. */
  connect(options: { nutrition: boolean }): Promise<HealthStatus>
  cancelConnect(): Promise<void>
  disconnect(): Promise<HealthStatus>
  /** Removes the client file as well as the connection. */
  forgetClient(): Promise<HealthStatus>
  /** Daily totals for every date from `start` to `end`, inclusive. */
  fetch(range: { start: string; end: string }): Promise<HealthFetchResult>
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
  health: HealthBridge
}
