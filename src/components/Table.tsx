import type { LucideIcon } from 'lucide-react'

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap border-b border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

export function Td({ children, align = 'left', className = '' }: { children?: React.ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-3 text-text ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
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

export function TableEmpty({ colSpan, icon: Icon, title, action }: { colSpan: number; icon: LucideIcon; title: string; action?: React.ReactNode }) {
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
