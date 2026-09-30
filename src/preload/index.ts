import { contextBridge, ipcRenderer } from 'electron'
import type { AppInfo, FiefdomBridge, HealthFetchResult, HealthStatus } from '../shared/api'

const bridge: FiefdomBridge = {
  loadLedger: () => ipcRenderer.invoke('ledger:load') as Promise<string | null>,
  saveLedger: (json) => ipcRenderer.invoke('ledger:save', json) as Promise<void>,
  saveLedgerSync: (json) => ipcRenderer.sendSync('ledger:save-sync', json) === true,
  revealLedger: () => ipcRenderer.invoke('ledger:reveal') as Promise<void>,
  appInfo: () => ipcRenderer.invoke('app:info') as Promise<AppInfo>,
  health: {
    status: () => ipcRenderer.invoke('health:status') as Promise<HealthStatus>,
    importClient: () => ipcRenderer.invoke('health:import-client') as Promise<HealthStatus>,
    connect: (options) => ipcRenderer.invoke('health:connect', { nutrition: !!options?.nutrition }) as Promise<HealthStatus>,
    cancelConnect: () => ipcRenderer.invoke('health:cancel-connect') as Promise<void>,
    disconnect: () => ipcRenderer.invoke('health:disconnect') as Promise<HealthStatus>,
    forgetClient: () => ipcRenderer.invoke('health:forget-client') as Promise<HealthStatus>,
    fetch: (range) => ipcRenderer.invoke('health:fetch', { start: range.start, end: range.end }) as Promise<HealthFetchResult>
  }
}

contextBridge.exposeInMainWorld('fiefdom', bridge)
