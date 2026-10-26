import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { DEFAULT_CURRENCY, formatCurrency as formatWithCurrency } from './currency'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Currency-aware money formatter.
 *
 * Single-argument calls keep the historical NGN behaviour so every existing
 * call site renders exactly as before. Pass a currency code to render an
 * account/transaction in its own currency.
 */
export function formatCurrency(amount: number, currency: string = DEFAULT_CURRENCY): string {
  return formatWithCurrency(amount, currency)
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('en-NG').format(amount)
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function getMonthLabel(month: string): string {
  const [year, m] = month.split('-')
  const date = new Date(parseInt(year), parseInt(m) - 1)
  return date.toLocaleDateString('en-NG', { year: 'numeric', month: 'long' })
}

export function getMonthStart(month: string): string {
  return `${month}-01`
}

export function getMonthEnd(month: string): string {
  const [year, m] = month.split('-')
  const nextMonth = new Date(parseInt(year), parseInt(m), 1)
  return nextMonth.toISOString().split('T')[0]
}

export function previousMonth(month: string): string {
  const [year, m] = month.split('-')
  const date = new Date(parseInt(year), parseInt(m) - 2, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function nextMonth(month: string): string {
  const [year, m] = month.split('-')
  const date = new Date(parseInt(year), parseInt(m), 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function generateId(): string {
  return crypto.randomUUID()
}
