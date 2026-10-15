/**
 * Talks to the Electron main process when running as the desktop app.
 * Falls back to localStorage when the UI is opened in a plain browser (handy while designing).
 */
const LS_KEY = 'fiefdom:ledger'
/** The campaign: campaign.json beside the ledger (A-08), or its own localStorage key. */
const CAMPAIGN_LS_KEY = 'fiefdom:campaign'

const bridge = typeof window !== 'undefined' ? window.fiefdom : undefined

export const isDesktop = !!bridge

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocalSync(key: string, json: string): boolean {
  try {
    localStorage.setItem(key, json)
    return true
  } catch {
    return false
  }
}

export async function loadLedgerText(): Promise<string | null> {
  return bridge ? bridge.loadLedger() : readLocal(LS_KEY)
}

export async function saveLedgerText(json: string): Promise<void> {
  if (bridge) return bridge.saveLedger(json)
  localStorage.setItem(LS_KEY, json)
}

export function saveLedgerTextSync(json: string): boolean {
  return bridge ? bridge.saveLedgerSync(json) : writeLocalSync(LS_KEY, json)
}

export async function loadCampaignText(): Promise<string | null> {
  return bridge ? bridge.loadCampaign() : readLocal(CAMPAIGN_LS_KEY)
}

export async function saveCampaignText(json: string): Promise<void> {
  if (bridge) return bridge.saveCampaign(json)
  localStorage.setItem(CAMPAIGN_LS_KEY, json)
}

export function saveCampaignTextSync(json: string): boolean {
  return bridge ? bridge.saveCampaignSync(json) : writeLocalSync(CAMPAIGN_LS_KEY, json)
}

/** Keeps the campaign as it stands under `tag`, for good (the re-founding, C-15). In a plain browser, under its own localStorage key. */
export async function archiveCampaignText(tag: string): Promise<string | null> {
  if (bridge) return bridge.archiveCampaign(tag)
  const current = readLocal(CAMPAIGN_LS_KEY)
  const key = `${CAMPAIGN_LS_KEY}:${tag}`
  if (current === null) return null
  if (readLocal(key) === null) localStorage.setItem(key, current)
  return key
}

export async function revealLedgerFolder(): Promise<void> {
  await bridge?.revealLedger()
}

export async function appInfo(): Promise<{ version: string; dataDir: string } | null> {
  return bridge ? bridge.appInfo() : null
}
