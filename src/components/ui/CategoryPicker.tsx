import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import type { Category } from '@/types'
import type { CategoryKind } from '@/lib/categories'
import { CategoryIcon } from './CategoryIcon'
import { cn } from '@/lib/utils'

interface CategoryPickerProps {
  categories: Category[]
  kind: CategoryKind
  value: string
  onChange: (categoryId: string) => void
  /** Adds "Add custom category" inline when provided. */
  onCreate?: (name: string) => Promise<void> | void
  id?: string
  disabled?: boolean
}

/**
 * Searchable, icon-first category selector.
 *
 * Replaces bare `<select>`s so category icons are visible at every breakpoint;
 * a grid of icon tiles is also far easier to hit on a phone than a native
 * dropdown. Search only appears once there are enough options to warrant it.
 */
export function CategoryPicker({
  categories,
  kind,
  value,
  onChange,
  onCreate,
  id,
  disabled,
}: CategoryPickerProps) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const searchable = categories.length > 8

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return categories
    return categories.filter((c) => c.name.toLowerCase().includes(q))
  }, [categories, query])

  const handleCreate = async () => {
    if (!onCreate || !newName.trim()) return
    setSaving(true)
    await onCreate(newName.trim())
    setSaving(false)
    setNewName('')
    setCreating(false)
  }

  return (
    <div id={id} className="space-y-2">
      {searchable && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-light" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search categories"
            aria-label="Search categories"
            className="input-field pl-9"
          />
        </div>
      )}

      <div
        role="radiogroup"
        aria-label={kind === 'income' ? 'Income category' : 'Expense category'}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
      >
        {filtered.map((category) => {
          const selected = value === category.id
          return (
            <button
              key={category.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(selected ? '' : category.id)}
              title={category.name}
              className={cn(
                'flex min-h-[2.75rem] items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors cursor-pointer',
                selected
                  ? 'border-cta bg-cta/10 text-cta'
                  : 'border-border bg-surface text-text hover:bg-surface-alt',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                  selected ? 'bg-cta/15 text-cta' : 'bg-surface-alt text-text-muted'
                )}
              >
                <CategoryIcon icon={category.icon} name={category.name} kind={kind} />
              </span>
              <span className="truncate text-xs font-medium">{category.name}</span>
            </button>
          )
        })}

        {filtered.length === 0 && (
          <p className="col-span-full py-3 text-center text-xs text-text-muted">
            No category matches “{query}”
          </p>
        )}
      </div>

      {onCreate && (
        <div className="pt-1">
          {creating ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="New category name"
                aria-label="New category name"
                autoFocus
                className="input-field flex-1 text-sm"
              />
              <button type="button" onClick={handleCreate} disabled={saving || !newName.trim()} className="btn-primary text-sm">
                {saving ? 'Adding…' : 'Add'}
              </button>
              <button type="button" onClick={() => { setCreating(false); setNewName('') }} className="btn-secondary text-sm">
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-cta hover:text-cta-light cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add custom category
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Compact read-only chip used in lists and cards. */
export function CategoryChip({ category, kind }: { category?: Category | null; kind: CategoryKind }) {
  if (!category) return <span className="text-xs text-text-light">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-2 py-0.5 text-xs font-medium text-text-muted">
      <CategoryIcon icon={category.icon} name={category.name} kind={kind} className="h-3.5 w-3.5" />
      {category.name}
    </span>
  )
}
