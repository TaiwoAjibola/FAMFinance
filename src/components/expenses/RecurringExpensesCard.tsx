import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { DEFAULT_CURRENCY } from '@/lib/currency'
import { Modal, ModalFormFooter } from '@/components/ui/Modal'
import { Plus, Repeat, CheckCircle2, Pencil, Trash2 } from 'lucide-react'
import type { Account, Category } from '@/types'

interface RecurringExpenseRow {
  id: string
  household_id: string
  category_id: string | null
  name: string
  amount: number
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
  start_date: string
  end_date: string | null
  next_due_date: string | null
  is_active: boolean
  notes: string | null
}

function nextDue(dateIso: string, frequency: RecurringExpenseRow['frequency']): string {
  const d = new Date(dateIso + 'T00:00:00')
  if (frequency === 'weekly') d.setDate(d.getDate() + 7)
  else if (frequency === 'biweekly') d.setDate(d.getDate() + 14)
  else if (frequency === 'monthly') d.setMonth(d.getMonth() + 1)
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3)
  else if (frequency === 'yearly') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export function RecurringExpensesCard(props: {
  householdId: string
  userId: string
  accounts: Account[]
  categories: Category[]
  currency?: string
  onChanged: () => void
}) {
  const { householdId, userId, accounts, categories, currency = DEFAULT_CURRENCY, onChanged } = props
  const [items, setItems] = useState<RecurringExpenseRow[]>([])
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<RecurringExpenseRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState<RecurringExpenseRow | null>(null)
  const [payAccountId, setPayAccountId] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [form, setForm] = useState({ name: '', amount: '', frequency: 'monthly' as RecurringExpenseRow['frequency'], next_due_date: new Date().toISOString().slice(0, 10), category_id: '', notes: '' })

  const load = async () => {
    const { data, error } = await supabase.from('recurring_expenses').select('*').eq('household_id', householdId).order('next_due_date', { ascending: true })
    if (error) {
      setUnavailable(error.message.toLowerCase().includes('recurring_expenses') ? 'Recurring expenses unavailable until migration 014_recurring_expenses.sql is applied.' : error.message)
      setItems([])
      return
    }
    setUnavailable(null)
    setItems((data || []) as RecurringExpenseRow[])
  }

  useEffect(() => { void load() }, [householdId])

  const openNew = () => { setEditing(null); setForm({ name: '', amount: '', frequency: 'monthly', next_due_date: new Date().toISOString().slice(0, 10), category_id: '', notes: '' }); setShowForm(true) }
  const openEdit = (r: RecurringExpenseRow) => { setEditing(r); setForm({ name: r.name, amount: String(r.amount), frequency: r.frequency, next_due_date: r.next_due_date || r.start_date, category_id: r.category_id || '', notes: r.notes || '' }); setShowForm(true) }

  const save = async () => {
    const amount = Number(form.amount)
    if (!form.name.trim() || !Number.isFinite(amount) || amount <= 0) return
    setSaving(true)
    const payload = {
      household_id: householdId,
      name: form.name.trim(),
      amount,
      frequency: form.frequency,
      next_due_date: form.next_due_date,
      category_id: form.category_id || null,
      notes: form.notes || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }
    const res = editing
      ? await supabase.from('recurring_expenses').update(payload).eq('id', editing.id)
      : await supabase.from('recurring_expenses').insert({ ...payload, start_date: form.next_due_date, created_by: userId })
    setSaving(false)
    if (!res.error) { setShowForm(false); await load() }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this recurring expense?')) return
    await supabase.from('recurring_expenses').delete().eq('id', id)
    await load()
  }

  const markPaid = async () => {
    if (!paying || !payAccountId) return
    setSaving(true)
    const amount = paying.amount
    const { error: txErr } = await supabase.from('transactions').insert({
      household_id: householdId, account_id: payAccountId, category_id: paying.category_id,
      type: 'expense', amount, description: `${paying.name} (recurring)`, date: payDate, status: 'received', created_by: userId,
    })
    if (!txErr) {
      const { data: acct } = await supabase.from('accounts').select('balance').eq('id', payAccountId).single()
      if (acct) await supabase.from('accounts').update({ balance: acct.balance - amount }).eq('id', payAccountId)
      await supabase.from('recurring_expenses').update({ next_due_date: nextDue(paying.next_due_date || payDate, paying.frequency), updated_at: new Date().toISOString() }).eq('id', paying.id)
      setPaying(null)
      await load()
      onChanged()
    }
    setSaving(false)
  }

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-text"><Repeat className="h-5 w-5 text-cta" />Recurring & expected expenses</h2>
          <p className="mt-1 text-sm text-text-muted">Define recurring obligations. They become actual expenses only when you confirm payment.</p>
        </div>
        <button type="button" className="btn-primary" onClick={openNew} disabled={!!unavailable}><Plus className="h-4 w-4" />Add recurring</button>
      </div>
      {unavailable && <p className="mb-3 rounded-lg bg-warning/10 p-3 text-sm text-warning">{unavailable}</p>}
      {items.length === 0 && !unavailable ? (
        <p className="text-sm text-text-muted">No recurring expenses yet. Add rent, internet, subscriptions, or other regular costs.</p>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="font-medium text-text">{r.name} <span className="text-xs font-normal text-text-muted capitalize">· {r.frequency}</span></p>
                <p className="text-sm text-text-muted">{formatCurrency(r.amount, currency)} {r.next_due_date ? `· next due ${r.next_due_date}` : ''}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary py-1.5 px-3 text-xs" onClick={() => { setPaying(r); setPayAccountId(accounts[0]?.id || ''); setPayDate(new Date().toISOString().slice(0, 10)) }}><CheckCircle2 className="h-4 w-4" />Mark paid</button>
                <button type="button" className="btn-secondary py-1.5 px-3 text-xs" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" />Edit</button>
                <button type="button" className="btn-secondary py-1.5 px-3 text-xs text-danger" onClick={() => void remove(r.id)}><Trash2 className="h-4 w-4" />Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} title={editing ? 'Edit recurring expense' : 'Add recurring expense'} description="Expected expense definition. Confirm payment later to create an actual expense." onClose={() => setShowForm(false)} size="lg" footer={<ModalFormFooter formId="recurring-form" submitLabel={editing ? 'Update' : 'Add'} saving={saving} onCancel={() => setShowForm(false)} />}>
        <form id="recurring-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="label">Name</label><input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div><label className="label">Amount</label><input type="number" className="input-field" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
            <div><label className="label">Frequency</label><select className="input-field" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as RecurringExpenseRow['frequency'] })}><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option><option value="custom">Custom</option></select></div>
            <div><label className="label">Next due date</label><input type="date" className="input-field" value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} required /></div>
            <div className="sm:col-span-2"><label className="label">Category</label><select className="input-field" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}><option value="">No category</option>{categories.filter((c) => c.type === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="sm:col-span-2"><label className="label">Notes</label><input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
        </form>
      </Modal>

      <Modal open={!!paying} title="Record recurring payment" description={paying ? `This creates an actual expense for "${paying.name}" and advances the next due date.` : undefined} onClose={() => !saving && setPaying(null)} size="lg" footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" onClick={() => setPaying(null)} disabled={saving}>Cancel</button><button type="button" className="btn-primary" onClick={() => void markPaid()} disabled={saving || !payAccountId}>{saving ? 'Saving…' : 'Confirm payment'}</button></div>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label">Pay from account</label><select className="input-field" value={payAccountId} onChange={(e) => setPayAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}</select></div>
          <div><label className="label">Payment date</label><input type="date" className="input-field" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
        </div>
      </Modal>
    </div>
  )
}
