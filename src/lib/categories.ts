import type { LucideIcon } from 'lucide-react'
import {
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Bus,
  Church,
  Coins,
  Droplets,
  Flame,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  Landmark,
  Laptop,
  Lightbulb,
  MoreHorizontal,
  PiggyBank,
  Popcorn,
  Receipt,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  TrendingUp,
  Tv,
  Wifi,
  Zap,
} from 'lucide-react'

export type CategoryKind = 'income' | 'expense'

/**
 * Canonical icon keys. Persisted as text on `categories.icon` so a category
 * keeps its icon across devices and sessions without shipping a component tree.
 */
export const CATEGORY_ICONS = {
  groceries: ShoppingBasket,
  transport: Bus,
  housing: Home,
  utilities: Lightbulb,
  healthcare: HeartPulse,
  education: GraduationCap,
  family: Baby,
  shopping: ShoppingBag,
  entertainment: Tv,
  gaming: Gamepad2,
  business: Briefcase,
  debt: HandCoins,
  savings: PiggyBank,
  salary: Banknote,
  freelance: Laptop,
  investment: TrendingUp,
  gift: Gift,
  giving: Church,
  bank: Landmark,
  bills: Receipt,
  internet: Wifi,
  power: Zap,
  water: Droplets,
  cooking: Flame,
  learning: BookOpen,
  snacks: Popcorn,
  coins: Coins,
  other: MoreHorizontal,
  sparkles: Sparkles,
} satisfies Record<string, LucideIcon>

export type CategoryIconKey = keyof typeof CATEGORY_ICONS

const ICON_KEYS = Object.keys(CATEGORY_ICONS) as CategoryIconKey[]

export function isCategoryIconKey(value: unknown): value is CategoryIconKey {
  return typeof value === 'string' && (ICON_KEYS as string[]).includes(value)
}

/**
 * Always returns a component. Unknown or missing icon data falls back rather
 * than rendering nothing — an absent glyph is exactly what made category icons
 * look "missing" on small screens.
 */
export function getCategoryIcon(icon?: string | null): LucideIcon {
  return isCategoryIconKey(icon) ? CATEGORY_ICONS[icon] : MoreHorizontal
}

export interface SuggestedCategory {
  name: string
  icon: CategoryIconKey
  /** Lowercase hints used for both icon fallback and description matching. */
  keywords: string[]
}

export const SUGGESTED_EXPENSE_CATEGORIES: SuggestedCategory[] = [
  { name: 'Food and Groceries', icon: 'groceries', keywords: ['food', 'grocery', 'groceries', 'market', 'rice', 'bread', 'milk', 'restaurant', 'lunch', 'dinner'] },
  { name: 'Transportation', icon: 'transport', keywords: ['transport', 'bus', 'taxi', 'fuel', 'petrol', 'diesel', 'uber', 'bolt', 'fare', 'commute'] },
  { name: 'Housing and Utilities', icon: 'housing', keywords: ['rent', 'house', 'housing', 'utility', 'utilities', 'electricity', 'water', 'internet', 'wifi', 'bill', 'dustbin', 'waste', 'gas'] },
  { name: 'Healthcare', icon: 'healthcare', keywords: ['health', 'hospital', 'doctor', 'drug', 'medicine', 'pharmacy', 'clinic', 'medical'] },
  { name: 'Education', icon: 'education', keywords: ['school', 'education', 'seminary', 'tuition', 'fees', 'books', 'student', 'course'] },
  { name: 'Family and Personal Care', icon: 'family', keywords: ['family', 'child', 'children', 'daughter', 'son', 'baby', 'personal', 'care', 'hair', 'toiletries'] },
  { name: 'Shopping', icon: 'shopping', keywords: ['shopping', 'clothes', 'cloth', 'shoe', 'shoes', 'bag', 'gadget', 'electronics'] },
  { name: 'Entertainment', icon: 'entertainment', keywords: ['entertainment', 'movie', 'netflix', 'music', 'cinema', 'game', 'outing', 'fun'] },
  { name: 'Business', icon: 'business', keywords: ['business', 'office', 'project', 'client', 'work', 'shop rent', 'supplies'] },
  { name: 'Debt Repayment', icon: 'debt', keywords: ['debt', 'loan', 'repay', 'repayment', 'owe', 'borrowed', 'credit'] },
  { name: 'Savings and Investments', icon: 'savings', keywords: ['saving', 'savings', 'invest', 'investment', 'deposit', 'shares', 'thrift'] },
  { name: 'Other', icon: 'other', keywords: ['other', 'misc', 'miscellaneous'] },
]

export const SUGGESTED_INCOME_CATEGORIES: SuggestedCategory[] = [
  { name: 'Salary', icon: 'salary', keywords: ['salary', 'wage', 'payroll', 'pay', 'stipend'] },
  { name: 'Business Income', icon: 'business', keywords: ['business', 'shop', 'sales', 'revenue', 'trade'] },
  { name: 'Freelance Income', icon: 'freelance', keywords: ['freelance', 'contract', 'gig', 'consulting', 'project income'] },
  { name: 'Investment Income', icon: 'investment', keywords: ['investment', 'dividend', 'interest', 'returns', 'portfolio'] },
  { name: 'Gifts and Support', icon: 'gift', keywords: ['gift', 'support', 'donation', 'assistance', 'allowance', 'help'] },
  { name: 'Other Income', icon: 'other', keywords: ['other income', 'misc', 'sundries'] },
]

export function suggestedCategories(kind: CategoryKind): SuggestedCategory[] {
  return kind === 'income' ? SUGGESTED_INCOME_CATEGORIES : SUGGESTED_EXPENSE_CATEGORIES
}

/**
 * Fallback icon for legacy categories that were created before icons existed.
 * Matches on the category name so older records still show a sensible glyph
 * instead of a blank space.
 */
export function inferIconKeyFromName(name: string, kind: CategoryKind): CategoryIconKey {
  const haystack = name.toLowerCase()
  const pool = suggestedCategories(kind)
  for (const entry of pool) {
    if (entry.keywords.some((k) => haystack.includes(k))) return entry.icon
  }
  if (/gas|cook/.test(haystack)) return 'cooking'
  if (/electric|power|nepa|light/.test(haystack)) return 'power'
  if (/water/.test(haystack)) return 'water'
  if (/internet|data|wifi/.test(haystack)) return 'internet'
  if (/bank/.test(haystack)) return 'bank'
  if (/church|tithe|offering|theolog/.test(haystack)) return 'giving'
  return 'other'
}

export interface CategoryLike {
  id: string
  name: string
  icon?: string | null
}

export function iconKeyForCategory(category: CategoryLike, kind: CategoryKind): CategoryIconKey {
  if (isCategoryIconKey(category.icon)) return category.icon
  return inferIconKeyFromName(category.name, kind)
}

function scoreCandidate(haystack: string, keywords: string[]): number {
  let best = 0
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) best = Math.max(best, keyword.length)
  }
  return best
}

/**
 * Suggests a category from free-text input. Never guesses for transfers (callers
 * must skip suggestions for transfers) and always returns something the user can
 * override before saving.
 */
export function suggestCategory<T extends CategoryLike>(
  description: string,
  categories: T[],
  kind: CategoryKind
): T | null {
  const haystack = (description || '').trim().toLowerCase()
  if (!haystack || categories.length === 0) return null

  let best: T | null = null
  let bestScore = 0

  for (const category of categories) {
    const entry = suggestedCategories(kind).find((s) => s.name === category.name)
    const keywords = entry?.keywords ?? [category.name.toLowerCase()]
    const score = scoreCandidate(haystack, keywords)
    if (score > bestScore) {
      bestScore = score
      best = category
    }
  }

  return best
}
