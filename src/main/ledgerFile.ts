import { JsonFile } from './jsonFile'

export { localDateStamp } from './jsonFile'

/** The ledger: `ledger.json`, with daily backups at `backups/ledger-YYYY-MM-DD.json`. */
export class LedgerFile extends JsonFile {
  constructor(dir: string, keepBackups = 30) {
    super(dir, { name: 'ledger', keepBackups })
  }
}

/** The game: `campaign.json` beside the ledger, with daily backups at `backups/campaign-YYYY-MM-DD.json` (A-08). */
export class CampaignFile extends JsonFile {
  constructor(dir: string, keepBackups = 30) {
    super(dir, { name: 'campaign', keepBackups })
  }
}
