import { useMemo } from 'react'
import type { IconType } from 'react-icons'
import { GiCastle, GiCheckMark, GiHealthPotion, GiLaurels, GiScrollUnfurled, GiSiegeTower } from 'react-icons/gi'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { weekAhead, type WeekAim, type WeekAimKind } from '../../lib/game/view/weekAhead'
import { useLedgerData } from '../../state/hooks'
import { useUI } from '../../state/ui'

const ICONS: Record<WeekAimKind, IconType> = { commission: GiScrollUnfurled, healer: GiHealthPotion, siege: GiSiegeTower, rank: GiLaurels, build: GiCastle }

function Aim({ aim, onGo }: { aim: WeekAim; onGo?(): void }): React.JSX.Element {
  const Icon = aim.done ? GiCheckMark : ICONS[aim.kind]
  const body = (
    <>
      <span className="week-aim__head">
        <Icon aria-hidden="true" /> <strong>{aim.title}</strong>
      </span>
      <span className="week-aim__text">{aim.text}</span>
      <span className="week-aim__bar" style={{ ['--fill' as string]: aim.share }} aria-hidden="true" />
      <span className="week-aim__progress">{aim.progress}</span>
    </>
  )
  return (
    <li className={`week-aim week-aim--${aim.kind} ${aim.done ? 'is-done' : ''}`}>
      {onGo ? (
        <button type="button" className="week-aim__go" onClick={onGo} title={aim.page === 'diplomacy' ? 'To his court' : 'To the Chronicle'}>
          {body}
        </button>
      ) : (
        <div className="week-aim__go">{body}</div>
      )}
    </li>
  )
}

/**
 * Patch 10 stage 4 (L1): the week ahead, up to three aims with how each stands: a ruler's commission, Remedy's
 * request, the standing siege, the nearest path rank, the next step in reach of the purse. On the Realm page as a
 * strip, and in the week's first Dawn tidings (`onGo` leaves the card first). Public figures only.
 */
export function WeekAhead({ campaign, today, onGo }: { campaign: CampaignState; today: ISODate; onGo?(): void }): React.JSX.Element | null {
  const ledger = useLedgerData()
  const aims = useMemo(() => weekAhead(campaign, ledger, today), [campaign, ledger, today])
  if (aims.length === 0) return null
  return (
    <section className="week-ahead" aria-label="The week ahead">
      <h3 className="week-ahead__title">The week ahead</h3>
      <ul className="week-ahead__aims">
        {aims.map((a) => (
          <Aim
            key={`${a.kind}-${a.rival ?? ''}`}
            aim={a}
            onGo={
              a.page
                ? () => {
                    onGo?.()
                    useUI.getState().go(a.page as 'diplomacy' | 'chronicle')
                  }
                : undefined
            }
          />
        ))}
      </ul>
    </section>
  )
}
