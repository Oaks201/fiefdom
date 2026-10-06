/**
 * A game rule refused an action (not enough in the purse, a hex out of reach…). The campaign store
 * shows its message as a notice and leaves the campaign untouched, as `LedgerError` does for the ledger.
 */
export class CampaignError extends Error {
  override name = 'CampaignError'
}
