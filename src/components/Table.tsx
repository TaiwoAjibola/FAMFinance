import type { LucideIcon } from 'lucide-react'

export function Table({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`card overflow-x-auto ${className}`}>
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  )
}

const ALIGN = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const

type Align = keyof typeof ALIGN

/**
 * Keeps a column pinned to the right edge of the horizontally scrollable table.
 * Using it for the Actions column is what guarantees row icons stay on screen at
 * phone and tablet widths instead of being pushed past the 640px minimum table
 * width where nobody scrolls to them.
 */
const STICKY_RIGHT = 'sticky right-0 z-10 bg-surface'

export function Th({
  children,
  align = 'left',
  sticky,
}: {
  children: React.ReactNode
  align?: Align
  sticky?: boolean
}) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap border-b border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted ${
        ALIGN[align]
      } ${sticky ? STICKY_RIGHT : ''}`}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  align = 'left',
  className = '',
  sticky,
}: {
  children?: React.ReactNode
  align?: Align
  className?: string
  sticky?: boolean
}) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-3 text-text ${ALIGN[align]} ${
        sticky ? STICKY_RIGHT : ''
      } ${className}`}
    >
      {children}
    </td>
  )
}

export function TableLoading({ colSpan, label = 'Loading…' }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-12 text-center">
        <div className="mx-auto h-7 w-7 animate-spin rounded-full border-[3px] border-cta border-t-transparent" />
        <p className="mt-2 text-xs text-text-muted">{label}</p>
      </td>
    </tr>
  )
}

export function TableEmpty({
  colSpan,
  icon: Icon,
  title,
  action,
}: {
  colSpan: number
  icon: LucideIcon
  title: string
  action?: React.ReactNode
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-12 text-center">
        <Icon className="mx-auto h-10 w-10 text-text-light" />
        <p className="mt-3 text-sm text-text-muted">{title}</p>
        {action}
      </td>
    </tr>
  )
}
