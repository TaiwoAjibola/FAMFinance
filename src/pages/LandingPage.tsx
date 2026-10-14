import { Link } from 'react-router-dom'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  HandCoins,
  PiggyBank,
  Wallet,
  ShieldCheck,
  Smartphone,
  Users,
} from 'lucide-react'

const FEATURES = [
  {
    icon: ArrowDownCircle,
    title: 'Income',
    text: 'Plan expected income and record exactly what arrives — partial payments included.',
  },
  {
    icon: ArrowUpCircle,
    title: 'Expenses & transfers',
    text: 'Log every expense and move money between accounts without double-counting.',
  },
  {
    icon: Calendar,
    title: 'Budgets & plans',
    text: 'Set a monthly budget, track spending against it, and plan ahead for bigger costs.',
  },
  {
    icon: HandCoins,
    title: 'Debts',
    text: 'Track money you owe, record repayments in part or in full, and see what is left.',
  },
  {
    icon: PiggyBank,
    title: 'Savings',
    text: 'Save toward goals with a real destination account so every naira is accounted for.',
  },
  {
    icon: Users,
    title: 'Shared household',
    text: 'Invite your spouse by link. Editors can record, viewers can follow along.',
  },
]

export function LandingPage() {
  return (
    <div className="min-h-screen bg-primary">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20">
              <Wallet className="h-5 w-5 text-accent" />
            </div>
            <span className="text-lg font-bold text-white">FamFinance</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-text-light hover:bg-white/10 transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-primary hover:bg-accent-light transition-colors"
            >
              Create account
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="mt-14 sm:mt-20">
          <h1 className="text-3xl font-bold leading-tight text-white sm:text-5xl">
            Your household's money, <span className="text-accent">clearly in view.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-light sm:text-lg">
            FamFinance is a simple, private finance tracker for your family. See what comes in,
            what goes out, what you plan to spend, what you owe, and what you're saving — all in
            one place, from your phone.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/signup"
              className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-primary hover:bg-accent-light transition-colors"
            >
              Get started free
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-white/20 px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors"
            >
              I already have an account
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-text-light">
            <span className="inline-flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> Installable as an app</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Private to your household</span>
          </div>
        </section>

        {/* Features */}
        <section className="mt-16">
          <h2 className="text-xl font-semibold text-white sm:text-2xl">Everything your household tracks</h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15">
                  <f.icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="mt-3 text-base font-semibold text-white">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-text-light">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-16 border-t border-white/10 pt-6 text-center text-xs text-text-light">
          <p>FamFinance — household finance, made simple.</p>
        </footer>
      </div>
    </div>
  )
}
