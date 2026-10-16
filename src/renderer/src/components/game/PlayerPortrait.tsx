import { useState } from 'react'
import type { PortraitChoice } from '../../lib/game/view/playerPortrait'
import { usePlayerPortrait } from '../../state/playerPortrait'
import { GameArt } from './GameArt'

/**
 * The player's portrait, drawn as GameArt draws a card's file, for the file their tier and path
 * call for (`getPlayerPortrait`). While that file is missing it shows the next one in the chain
 * that exists, and with none, the player's placeholder card: never blank.
 */
export function PlayerPortrait({ choice, width, name, className }: { choice: PortraitChoice; width: number; name: string; className?: string }): React.JSX.Element {
  const portrait = usePlayerPortrait(choice)
  const [broken, setBroken] = useState<string | null>(null)
  if (!portrait.src || broken === portrait.src) return <GameArt slot="player.portrait" owner="player" width={width} label={name} title={name} className={className} />
  return (
    <img
      className={`game-art game-art--card ${className ?? ''}`}
      src={portrait.src}
      width={width}
      alt={name}
      title={name}
      draggable={false}
      data-file={portrait.file ?? ''}
      data-fallback={portrait.fallback}
      onError={() => setBroken(portrait.src)}
    />
  )
}
