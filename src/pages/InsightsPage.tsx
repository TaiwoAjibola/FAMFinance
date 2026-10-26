import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, Lightbulb, Loader2, Send, Sparkles } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { askInsights, InsightsError, type InsightsResponse } from '@/lib/insights/client'
import { formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/utils'
import { getMonthLabel } from '@/lib/utils'

const SUGGESTED_QUESTIONS = [
  'Where did most of my money go this month?',
  'Am I spending more than I earned this month?',
  'How does this month compare with last month?',
  'Which expenses can I reduce?',
  'How much debt do I still owe?',
  'How much should I set aside for my upcoming debt installments?',
]

export function InsightsPage() {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<InsightsResponse | null>(null)
  const [asked, setAsked] = useState<string | null>(null)

  const ask = async (text: string) => {
    const q = text.trim()
    if (!q || loading) return
    setQuestion(q)
    setAsked(q)
    setLoading(true)
    setError(null)
    try {
      setResult(await askInsights(q))
    } catch (err) {
      setResult(null)
      setError(err instanceof InsightsError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const snap = result?.snapshot

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
            <Sparkles className="h-6 w-6 text-cta" />
            AI Financial Insights
          </h1>
          <p className="text-sm text-text-muted">
            Ask about your recorded money. Answers use your own figures only.
          </p>
        </div>

        {/* Question box */}
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault()
            void ask(question)
          }}
        >
          <label htmlFor="insight-q" className="label">Ask FamFinance</label>
          <div className="flex gap-2">
            <input
              id="insight-q"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              className="input-field"
              placeholder="e.g. Where did most of my money go this month?"
            />
            <button type="submit" disabled={loading || !question.trim()} className="btn-primary shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="hidden sm:inline">{loading ? 'Thinking…' : 'Ask'}</span>
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void ask(s)}
                disabled={loading}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-left text-xs text-text-muted hover:bg-surface-alt cursor-pointer disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </form>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-lg bg-danger/10 p-4 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {loading && (
          <div className="card flex items-center gap-3 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-cta" />
            <p className="text-sm text-text-muted">Reading your recorded figures…</p>
          </div>
        )}

        {result && snap && !loading && (
          <div className="space-y-4">
            {/* Data quality */}
            {result.insufficientData && (
              <div className="flex items-start gap-3 rounded-lg bg-warning/10 p-4 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  There isn't enough recorded activity for a reliable answer yet. Record a few more
                  income and expense entries across at least two months for better insights.
                </p>
              </div>
            )}

            {/* Answer */}
            <div className="card">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Your question
              </p>
              <p className="mt-1 text-sm font-medium text-text">{asked}</p>

              {result.answer ? (
                <p className="mt-4 text-base leading-relaxed text-text">{result.answer}</p>
              ) : (
                <p className="mt-4 text-sm text-text-muted">{result.notice}</p>
              )}
            </div>

            {/* Recorded facts */}
            {result.facts.length > 0 && (
              <div className="card">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <h2 className="text-sm font-semibold text-text">Recorded facts</h2>
                </div>
                <ul className="space-y-2 text-sm text-text">
                  {result.facts.map((f, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations, clearly labelled as suggestions */}
            {result.recommendations.length > 0 && (
              <div className="card">
                <div className="mb-1 flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-warning" />
                  <h2 className="text-sm font-semibold text-text">Suggestions</h2>
                </div>
                <p className="mb-3 text-xs text-text-muted">
                  Based on your recorded data. These are ideas to consider, not guaranteed outcomes.
                </p>
                <ul className="space-y-2 text-sm text-text">
                  {result.recommendations.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Figures behind the answer, per currency */}
            <div className="card">
              <h2 className="text-sm font-semibold text-text">
                Figures · {getMonthLabel(snap.currentMonth)}
              </h2>
              <p className="mb-3 text-xs text-text-muted">
                Each currency is shown separately. Amounts are never converted.
              </p>
              {snap.byCurrency.length === 0 ? (
                <p className="text-sm text-text-muted">No income or expenses recorded yet.</p>
              ) : (
                <div className="space-y-4">
                  {snap.byCurrency.map((c) => (
                    <div key={c.currency} className="rounded-lg border border-border p-3">
                      <p className="text-xs font-semibold text-text-muted">{c.currency}</p>
                      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <Figure label="Income" value={formatCurrency(c.currentMonth.income, c.currency)} sub={`Last month ${formatCurrency(c.previousMonth.income, c.currency)}`} tone="success" />
                        <Figure label="Expenses" value={formatCurrency(c.currentMonth.expenses, c.currency)} sub={`Last month ${formatCurrency(c.previousMonth.expenses, c.currency)}`} tone="danger" />
                        <Figure label="Net" value={formatCurrency(c.currentMonth.net, c.currency)} sub={`Cash available ${formatCurrency(c.totalCashAvailable, c.currency)}`} tone={c.currentMonth.net >= 0 ? 'success' : 'danger'} />
                      </div>
                      {c.topExpenseCategories.length > 0 && (
                        <ul className="mt-3 space-y-1 text-xs text-text-muted">
                          {c.topExpenseCategories.map((cat) => (
                            <li key={cat.name} className="flex justify-between">
                              <span>{cat.name} · {cat.shareOfExpenses}%</span>
                              <span className="font-medium text-text">{formatCurrency(cat.amount, c.currency)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Links to the underlying pages */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <DeepLink to="/budget" label={`Budget · ${snap.budget.items.filter((i) => i.status !== 'ok').length} need attention`} />
              <DeepLink to="/expenses" label="Transactions" />
              <DeepLink to="/debts" label={`Debts · ${snap.debts.filter((d) => !d.settled).length} open`} />
            </div>

            <p className="text-xs text-text-muted">
              Generated {formatDate(snap.generatedAt)}. This is general information based on the
              figures you recorded, not professional financial, tax or legal advice.
            </p>
          </div>
        )}
      </div>
    </Layout>
  )
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'success' | 'danger' }) {
  const color = tone === 'success' ? 'text-success' : 'text-danger'
  return (
    <div className="rounded-lg bg-surface-alt p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
      <p className="mt-0.5 text-xs text-text-muted">{sub}</p>
    </div>
  )
}

function DeepLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="card flex items-center justify-between text-sm font-medium text-text hover:bg-surface-alt">
      {label}
      <ArrowRight className="h-4 w-4 text-text-muted" />
    </Link>
  )
}
