import { createPortal } from 'react-dom'
import { useFloats } from '../state/floats'
import { useToasts } from '../state/toasts'

export function FloatLayer(): React.JSX.Element {
  const floats = useFloats((s) => s.floats)
  return createPortal(
    <div className="float-layer" aria-hidden="true">
      {floats.map((f) => (
        <span key={f.id} className={`float-text float-text--${f.tone}`} style={{ left: f.x, top: f.y }}>
          {f.text}
        </span>
      ))}
    </div>,
    document.body
  )
}

export function Toasts(): React.JSX.Element {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} type="button" className={`toast toast--${t.tone}`} onClick={() => dismiss(t.id)}>
          {t.text}
        </button>
      ))}
    </div>,
    document.body
  )
}
