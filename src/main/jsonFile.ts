import fs from 'node:fs'
import path from 'node:path'

/** Hard ceiling so a runaway renderer can never fill the disk. Years of data is well under 1 MB. */
const MAX_BYTES = 25 * 1024 * 1024

export function localDateStamp(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parses(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

export interface JsonFileOptions {
  /** "ledger" keeps `ledger.json`, backs up to `backups/ledger-YYYY-MM-DD.json` and names itself in errors */
  name: string
  keepBackups?: number
}

/**
 * One JSON document in one file. Writes go to a temp file first and are then renamed
 * over the original, so a crash mid-write can never leave a half-written file.
 * Before the first write of each day, the previous file is copied into backups/.
 */
export class JsonFile {
  readonly file: string
  readonly backupDir: string
  private readonly name: string
  private readonly keepBackups: number
  private readonly backupRe: RegExp
  private chain: Promise<void> = Promise.resolve()

  constructor(
    readonly dir: string,
    options: JsonFileOptions
  ) {
    this.name = options.name
    this.keepBackups = options.keepBackups ?? 30
    this.file = path.join(dir, `${this.name}.json`)
    this.backupDir = path.join(dir, 'backups')
    this.backupRe = new RegExp(`^${this.name}-\\d{4}-\\d{2}-\\d{2}\\.json$`)
  }

  load(): string | null {
    const main = this.readIfValid(this.file)
    if (main !== null) return main

    if (fs.existsSync(this.file)) {
      // Keep the damaged file for inspection rather than silently overwriting it later.
      try {
        fs.copyFileSync(this.file, path.join(this.dir, `${this.name}.corrupt-${Date.now()}.json`))
      } catch {
        /* ignore */
      }
    }
    for (const name of this.listBackups().reverse()) {
      const text = this.readIfValid(path.join(this.backupDir, name))
      if (text !== null) return text
    }
    return null
  }

  /** Queued so overlapping saves always land in order. */
  save(json: string): Promise<void> {
    const run = (): void => this.writeNow(json)
    this.chain = this.chain.then(run, run)
    return this.chain
  }

  saveSync(json: string): void {
    this.writeNow(json)
  }

  private writeNow(json: string): void {
    if (typeof json !== 'string' || json.length > MAX_BYTES || !parses(json)) {
      throw new Error(`Refusing to write an invalid ${this.name}`)
    }
    fs.mkdirSync(this.dir, { recursive: true })
    this.backupIfNeeded()
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, json, 'utf8')
    try {
      fs.renameSync(tmp, this.file)
    } catch {
      // Some antivirus tools briefly lock files on Windows; fall back to a direct write.
      fs.writeFileSync(this.file, json, 'utf8')
      try {
        fs.unlinkSync(tmp)
      } catch {
        /* ignore */
      }
    }
  }

  private backupIfNeeded(): void {
    const target = path.join(this.backupDir, `${this.name}-${localDateStamp()}.json`)
    if (fs.existsSync(target)) return
    const current = this.readIfValid(this.file)
    if (current === null) return
    fs.mkdirSync(this.backupDir, { recursive: true })
    fs.writeFileSync(target, current, 'utf8')
    const all = this.listBackups()
    for (const old of all.slice(0, Math.max(0, all.length - this.keepBackups))) {
      try {
        fs.unlinkSync(path.join(this.backupDir, old))
      } catch {
        /* ignore */
      }
    }
  }

  private listBackups(): string[] {
    try {
      return fs
        .readdirSync(this.backupDir)
        .filter((f) => this.backupRe.test(f))
        .sort()
    } catch {
      return []
    }
  }

  private readIfValid(file: string): string | null {
    try {
      const text = fs.readFileSync(file, 'utf8')
      return parses(text) ? text : null
    } catch {
      return null
    }
  }
}
