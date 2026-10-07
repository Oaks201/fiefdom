import { toast } from './toasts'

/**
 * Debounced saving for a store: each call keeps the latest value and writes it after a short
 * pause; a failed write shows one notice and retries every few seconds; closing the window flushes
 * whatever is still waiting, synchronously. `what` names the file in messages ("ledger").
 */
export function debouncedSaver(what: string, save: (json: string) => Promise<void>, saveSync: (json: string) => boolean): (value: unknown) => void {
  let pending: string | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let failedOnce = false

  async function flush(): Promise<void> {
    if (pending === null) return
    const json = pending
    pending = null
    try {
      await save(json)
      failedOnce = false
    } catch (err) {
      console.error(`Saving the ${what} failed`, err)
      if (!failedOnce) toast(`The ${what} could not be saved. Retrying…`, 'error')
      failedOnce = true
      if (pending === null) pending = json
      clearTimeout(timer)
      timer = setTimeout(() => void flush(), 3000)
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (pending !== null) {
        saveSync(pending)
        pending = null
      }
    })
  }

  return (value) => {
    pending = JSON.stringify(value)
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), 350)
  }
}
