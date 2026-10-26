import { useEffect, useRef, type ReactNode } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Wide variant for forms with grids. */
  size?: 'md' | 'lg'
}

/**
 * Accessible dialog. Renders as a bottom sheet on phones and a centred panel
 * from `sm` up, which keeps forms usable on small screens without introducing a
 * second component.
 */
export function Modal({ open, title, description, onClose, children, footer, size = 'md' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Keep the latest onClose in a ref so the effect below runs only when the
  // dialog opens or closes. Depending on onClose directly re-ran the effect on
  // every render and pulled focus back to the first field while typing.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus the first real field so keyboard and screen-reader users land in the
    // form; fall back to the first button only for content-only dialogs.
    const panel = panelRef.current
    const focusTarget =
      panel?.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]), select, textarea') ??
      panel?.querySelector<HTMLElement>('button:not([aria-label="Close"])')
    focusTarget?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-primary/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-surface shadow-xl sm:rounded-2xl',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md'
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-base font-semibold text-text sm:text-lg">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-text-muted sm:text-sm">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-alt hover:text-text cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>

        {footer && (
          <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>
        )}
      </div>
    </div>
  )
}

interface ModalFormFooterProps {
  /** id of the <form> this footer submits. Lets the buttons live outside the form. */
  formId: string
  submitLabel: string
  savingLabel?: string
  saving?: boolean
  disabled?: boolean
  onCancel: () => void
}

/** Standard Cancel + Save/Update footer for form modals. */
export function ModalFormFooter({
  formId,
  submitLabel,
  savingLabel = 'Saving…',
  saving,
  disabled,
  onCancel,
}: ModalFormFooterProps) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" onClick={onCancel} className="btn-secondary">
        Cancel
      </button>
      <button type="submit" form={formId} disabled={saving || disabled} className="btn-primary">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? savingLabel : submitLabel}
      </button>
    </div>
  )
}
