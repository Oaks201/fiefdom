import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { sfx } from '../audio'

interface ModalProps {
  open: boolean
  onClose(): void
  children: ReactNode
  title?: ReactNode
  className?: string
  /** clicking the dimmed desk closes the modal (default true) */
  dismissable?: boolean
  labelledBy?: string
}

export function Modal({ open, onClose, children, title, className, dismissable = true, labelledBy }: ModalProps): React.JSX.Element | null {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return
    sfx('open')
    const previous = document.activeElement as HTMLElement | null
    const focusTarget =
      panel.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel.current?.querySelector<HTMLElement>('input, textarea, select, button')
    focusTarget?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation()
        close.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      previous?.focus?.()
    }
  }, [open, dismissable])

  if (!open) return null
  return createPortal(
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={panel} className={`modal sheet ${className ?? ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="sheet__paper" aria-hidden="true" />
        {dismissable && (
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
        {title && (
          <h2 className="modal__title" id={labelledBy}>
            {title}
          </h2>
        )}
        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body
  )
}
