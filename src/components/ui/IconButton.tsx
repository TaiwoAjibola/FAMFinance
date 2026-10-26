import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type IconButtonVariant = 'default' | 'danger' | 'success' | 'cta'

const VARIANTS: Record<IconButtonVariant, string> = {
  default: 'text-text-muted hover:bg-surface-alt hover:text-text',
  danger: 'text-danger hover:bg-danger/10',
  success: 'text-success hover:bg-success/10',
  cta: 'text-cta hover:bg-cta/10',
}

interface IconButtonProps {
  icon: LucideIcon
  /** Accessible name. Also shown as the native tooltip. Always required so the
   *  control is never an unlabelled icon. */
  label: string
  onClick?: () => void
  variant?: IconButtonVariant
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
  /**
   * Icon size. The design system floor is `md` (1rem / 16px) — anything smaller
   * becomes invisible on low-density mobile screens and on installed PWAs.
   */
  size?: 'md' | 'lg'
}

/**
 * Round icon-only action button.
 *
 * Sizing is deliberately opinionated: a 36x36 hit area keeps touch targets
 * comfortable while the glyph itself never drops below 16px, which is what made
 * budget/debt row icons disappear on tablets and phones.
 */
export function IconButton({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
  disabled,
  className,
  type = 'button',
  size = 'md',
}: IconButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 cursor-pointer',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant],
        className
      )}
    >
      <Icon className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />
    </button>
  )
}
