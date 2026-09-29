/**
 * Talks to the Electron main process when running as the desktop app.
 * Falls back to localStorage when the UI is opened in a plain browser (handy while designing).
 */
const LS_KEY = 'fiefdom:ledger'

const bridge = typeof window !== 'undefined' ? window.fiefdom : undefined

export const isDesktop = !!bridge

export async function loadLedgerText(): Promise<string | null> {
  if (bridge) return bridge.loadLedger()
  try {
    return localStorage.getItem(LS_KEY)
  } catch {
    return null
  }
}

export async function saveLedgerText(json: string): Promise<void> {
  if (bridge) return bridge.saveLedger(json)
  localStorage.setItem(LS_KEY, json)
}

export function saveLedgerTextSync(json: string): boolean {
  if (bridge) return bridge.saveLedgerSync(json)
  try {
    localStorage.setItem(LS_KEY, json)
    return true
  } catch {
    return false
  }
}

export async function revealLedgerFolder(): Promise<void> {
  await bridge?.revealLedger()
}

export async function appInfo(): Promise<{ version: string; dataDir: string } | null> {
  return bridge ? bridge.appInfo() : null
}
