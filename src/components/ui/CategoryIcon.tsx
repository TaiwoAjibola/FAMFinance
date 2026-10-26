import { getCategoryIcon, iconKeyForCategory, type CategoryKind } from '@/lib/categories'
import { cn } from '@/lib/utils'

interface CategoryIconProps {
  /** Persisted icon key from `categories.icon`. */
  icon?: string | null
  /** Category name — used to infer an icon for legacy records. */
  name?: string
  kind?: CategoryKind
  className?: string
}

/**
 * Renders the icon for a category. Always emits something: a blank space in an
 * icon slot reads as a bug, which is why every fallback resolves to a real glyph.
 */
export function CategoryIcon({ icon, name = '', kind = 'expense', className }: CategoryIconProps) {
  const Icon = icon
    ? getCategoryIcon(icon)
    : getCategoryIcon(iconKeyForCategory({ id: name, name }, kind))

  return <Icon className={cn('h-4 w-4', className)} aria-hidden="true" />
}
