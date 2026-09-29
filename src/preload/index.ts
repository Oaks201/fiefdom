import { contextBridge, ipcRenderer } from 'electron'
import type { AppInfo, FiefdomBridge } from '../shared/api'

const bridge: FiefdomBridge = {
  loadLedger: () => ipcRenderer.invoke('ledger:load') as Promise<string | null>,
  saveLedger: (json) => ipcRenderer.invoke('ledger:save', json) as Promise<void>,
  saveLedgerSync: (json) => ipcRenderer.sendSync('ledger:save-sync', json) === true,
  revealLedger: () => ipcRenderer.invoke('ledger:reveal') as Promise<void>,
  appInfo: () => ipcRenderer.invoke('app:info') as Promise<AppInfo>
}

contextBridge.exposeInMainWorld('fiefdom', bridge)
