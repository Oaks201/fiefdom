import { useUI } from '../../state/ui'

/**
 * A rule's ? (Patch 7, E8): every rule is written in full once, in How to play or a rival's guide,
 * and a screen that shows what it means now links to it with this. `section` is a How to play
 * section id; `onOpen` opens another home instead (a rival's guide on Diplomacy).
 */
export function HelpLink({ section, onOpen, label = 'How this works' }: { section?: string; onOpen?(): void; label?: string }): React.JSX.Element {
  const openHelp = useUI((s) => s.openHelp)
  return (
    <button type="button" className="help-link" onClick={() => (onOpen ? onOpen() : section && openHelp(section))} title={label} aria-label={label}>
      ?
    </button>
  )
}
