'use client'
import { useState, useEffect } from 'react'

const FEATURES = [
  { icon: '⊛', title: 'AI-Powered Matching', desc: 'Claude AI matches bank transactions to invoices with 95%+ accuracy. ML learns from every confirmation to get smarter over time.' },
  { icon: '⚙', title: 'Fully Automated', desc: 'Schedule nightly runs to pick up bank files via SFTP, URL, or S3. Process, match, and deliver to your ERP while you sleep.' },
  { icon: '◈', title: 'Governed & Auditable', desc: 'SHA-256 hash chain on every event. Dual approval, threshold controls, immutable audit trail. Audit-grade compliance built in.' },
  { icon: '⬢', title: 'ERP Integration', desc: 'SAP IDOC, Oracle AR, NetSuite, Xero, CSV. Deliver output via SFTP, S3, or REST API directly to your ERP.' },
  { icon: '◉', title: 'Multi-Region', desc: 'Route debtors by region — NSW, VIC, QLD, NZ. Separate bank accounts, currencies, and source files per region.' },
  { icon: '✉', title: 'Smart Notifications', desc: 'ClickSend email and SMS on batch completion, exceptions, approvals, and ERP readiness.' },
]

const TESTIMONIALS = [
  { quote: 'We went from 4 hours of manual matching to a fully automated overnight run. Exceptions dropped 80% in the first month.', name: 'Sarah Chen', title: 'AR Manager, Pacific Distributors' },
  { quote: 'The AI reads remittance details from email bodies we could never parse before. Match rates went from 60% to 94%.', name: 'Mark Williams', title: 'Finance Controller, BuildSupply AU' },
  { quote: 'Finally a cash app platform built for ANZ. Regional routing and AUD/NZD handling works exactly as we needed.', name: 'Rachel Thompson', title: 'CFO, Trans-Tasman Holdings' },
]

const STEPS = [
  { num: '01', title: 'Sign up free', desc: '14-day trial, no credit card. Your account is ready in 30 seconds.' },
  { num: '02', title: 'Load your data', desc: 'Upload accounts and open items via CSV or connect your ERP via SFTP.' },
  { num: '03', title: 'Run the pipeline', desc: 'Upload your bank file and click Run. AI matches invoices in minutes.' },
  { num: '04', title: 'Review & export', desc: 'Approve any exceptions and export the ERP file — ready to post.' },
]

interface PlanPrice {
  display: string
  monthlyEquiv: string
  annualSaving: string | null
  stripePriceId: string | null
}

interface Plan {
  id: string
  code: string
  name: string
  description: string
  maxUsers: number
  maxBatches: number | string
  features: string[]
  price: PlanPrice
}

export default function LandingPage() {
  const [email, setEmail] = useState('')
  const [currency, setCurrency] = useState('AUD')
  const [interval, setInterval] = useState<'month' | 'year'>('month')
  const [plans, setPlans] = useState<Plan[]>([])
  const [promo, setPromo] = useState('')
  const [promoApplied, setPromoApplied] = useState('')
  const [promoError, setPromoError] = useState('')
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [checkingOut, setCheckingOut] = useState('')

  const teal = '#0EA5A0', tealL = '#2DD4BF'
  const surface = '#0D1526', border = '#324D72'
  const text1 = '#F8FAFF', text2 = '#C4D3E8', text3 = '#8899B8', bg = '#060A14'

  const CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR']
  const CURRENCY_NAMES: Record<string, string> = { AUD: 'A$ AUD', USD: '$ USD', NZD: 'NZ$ NZD', GBP: '£ GBP', EUR: '€ EUR' }

  useEffect(() => { fetchPlans() }, [currency, interval, promoApplied])

  async function fetchPlans() {
    setLoadingPlans(true)
    try {
      const params = new URLSearchParams({ currency, interval })
      if (promoApplied) params.set('promo', promoApplied)
      const res = await fetch(`/api/pricing?${params}`)
      const data = await res.json()
      if (res.ok) setPlans(data.plans ?? [])
    } catch {}
    setLoadingPlans(false)
  }

  async function applyPromo() {
    setPromoError('')
    if (!promo.trim()) return
    const res = await fetch(`/api/pricing?currency=${currency}&interval=${interval}&promo=${promo.trim().toUpperCase()}`)
    if (res.ok) {
      setPromoApplied(promo.trim().toUpperCase())
      setPromoError('')
    } else {
      const d = await res.json()
      setPromoError(d.error || 'Invalid promo code')
      setPromoApplied('')
    }
  }

  async function handleCheckout(plan: Plan) {
    if (!plan.price.stripePriceId) {
      // No Stripe price yet — go to signup with plan param
      window.location.href = `/signup?plan=${plan.code}&currency=${currency}&interval=${interval}`
      return
    }
    setCheckingOut(plan.code)
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkout', planCode: plan.code, currency, interval, promoCode: promoApplied || undefined }),
      })
      const data = await res.json()
      if (res.ok && data.url) {
        window.location.href = data.url
      } else if (res.status === 401) {
        // Not logged in — go to signup first
        window.location.href = `/signup?plan=${plan.code}&currency=${currency}&interval=${interval}&promo=${promoApplied}`
      } else {
        alert(data.error || 'Unable to start checkout')
      }
    } catch {
      alert('Network error — please try again')
    }
    setCheckingOut('')
  }

  function handleEnterprise() {
    window.location.href = 'mailto:sales@hindleconsultants.com.au?subject=Enterprise enquiry — CashFlow AI'
  }

  const inp = { background: surface, border: `1px solid ${border}`, borderRadius: 10, padding: '12px 18px', color: text1, fontSize: 15, outline: 'none' } as React.CSSProperties
  const sel = { ...inp, cursor: 'pointer', fontSize: 13, padding: '8px 12px' } as React.CSSProperties

  return (
    <div style={{ background: bg, color: text2, fontFamily: 'system-ui,-apple-system,sans-serif', minHeight: '100vh' }}>

      {/* Nav */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(6,10,20,0.95)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${border}`, padding: '0 40px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>⬡</span>
          <span style={{ color: text1, fontWeight: 700, fontSize: 17 }}>CashFlow AI</span>
          <span style={{ background: `${teal}20`, border: `1px solid ${teal}40`, borderRadius: 20, padding: '2px 10px', fontSize: 10, color: tealL, fontWeight: 700 }}>BY HINDLE CONSULTANTS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="#how-it-works" style={{ color: text3, fontSize: 14, textDecoration: 'none' }}>How it works</a>
          <a href="#features" style={{ color: text3, fontSize: 14, textDecoration: 'none' }}>Features</a>
          <a href="#pricing" style={{ color: text3, fontSize: 14, textDecoration: 'none' }}>Pricing</a>
          <a href="/login" style={{ color: text2, fontSize: 14, textDecoration: 'none', padding: '8px 16px', border: `1px solid ${border}`, borderRadius: 8 }}>Sign in</a>
          <a href="/signup" style={{ color: 'white', fontSize: 14, textDecoration: 'none', padding: '8px 18px', background: teal, borderRadius: 8, fontWeight: 600 }}>Free trial</a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '100px 40px 80px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${teal}15`, border: `1px solid ${teal}30`, borderRadius: 20, padding: '6px 16px', fontSize: 12, color: tealL, marginBottom: 28, fontWeight: 600 }}>
          ✦ Purpose-built for ANZ accounts receivable teams
        </div>
        <h1 style={{ color: text1, fontSize: 58, fontWeight: 300, lineHeight: 1.12, margin: '0 0 24px', letterSpacing: '-0.03em' }}>
          Cash application<br /><span style={{ color: tealL }}>on autopilot</span>
        </h1>
        <p style={{ fontSize: 19, color: text2, maxWidth: 600, margin: '0 auto 44px', lineHeight: 1.7 }}>
          AI matches bank transactions to invoices with 95%+ accuracy. Automated nightly runs. Direct ERP export to SAP, Oracle, NetSuite, or Xero.
        </p>
        <form onSubmit={e => { e.preventDefault(); window.location.href = `/signup?email=${encodeURIComponent(email)}` }}
          style={{ display: 'flex', gap: 10, maxWidth: 460, margin: '0 auto 20px', justifyContent: 'center' }}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@company.com" required
            style={{ ...inp, flex: 1 }} />
          <button type="submit" style={{ background: teal, border: 'none', borderRadius: 10, padding: '12px 24px', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Start free →
          </button>
        </form>
        <div style={{ color: text3, fontSize: 13 }}>14-day free trial · No credit card · Cancel anytime</div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24, maxWidth: 720, margin: '64px auto 0' }}>
          {[{ v: '95%+', l: 'Auto-match rate' }, { v: '$2.4M', l: 'Avg cash applied/day' }, { v: '< 2s', l: 'Per transaction' }, { v: '100%', l: 'Audit coverage' }].map(s => (
            <div key={s.l}>
              <div style={{ color: tealL, fontSize: 34, fontWeight: 700, fontFamily: 'monospace' }}>{s.v}</div>
              <div style={{ color: text3, fontSize: 13, marginTop: 4 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 40px' }}>
        <h2 style={{ textAlign: 'center', color: text1, fontSize: 36, fontWeight: 300, margin: '0 0 56px' }}>Up and running in minutes</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24, position: 'relative' }}>
          {STEPS.map((step, i) => (
            <div key={step.num} style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: 24, position: 'relative' }}>
              <div style={{ color: teal, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 12 }}>{step.num}</div>
              <div style={{ color: text1, fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{step.title}</div>
              <div style={{ color: text3, fontSize: 13, lineHeight: 1.7 }}>{step.desc}</div>
              {i < 3 && <div style={{ position: 'absolute', right: -13, top: '50%', color: border, fontSize: 20 }}>›</div>}
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <a href="/signup" style={{ display: 'inline-block', background: teal, color: 'white', textDecoration: 'none', padding: '14px 36px', borderRadius: 10, fontSize: 16, fontWeight: 700 }}>Start your free trial →</a>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 40px' }}>
        <h2 style={{ textAlign: 'center', color: text1, fontSize: 36, fontWeight: 300, margin: '0 0 56px' }}>Everything your AR team needs</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 26, marginBottom: 12 }}>{f.icon}</div>
              <div style={{ color: text1, fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{f.title}</div>
              <div style={{ color: text3, fontSize: 13, lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 40px' }}>
        <h2 style={{ textAlign: 'center', color: text1, fontSize: 32, fontWeight: 300, margin: '0 0 48px' }}>Trusted by AR teams across ANZ</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {TESTIMONIALS.map(t => (
            <div key={t.name} style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ color: tealL, fontSize: 32, marginBottom: 12, lineHeight: 1 }}>"</div>
              <p style={{ color: text2, fontSize: 14, lineHeight: 1.7, margin: '0 0 18px' }}>{t.quote}</p>
              <div style={{ color: text1, fontSize: 13, fontWeight: 600 }}>{t.name}</div>
              <div style={{ color: text3, fontSize: 12 }}>{t.title}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 40px' }}>
        <h2 style={{ textAlign: 'center', color: text1, fontSize: 36, fontWeight: 300, margin: '0 0 12px' }}>Simple, transparent pricing</h2>
        <p style={{ textAlign: 'center', color: text3, fontSize: 15, marginBottom: 36 }}>All plans include a 14-day free trial. No credit card required.</p>

        {/* Controls */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 36, flexWrap: 'wrap' }}>
          {/* Currency */}
          <select value={currency} onChange={e => setCurrency(e.target.value)} style={sel}>
            {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_NAMES[c]}</option>)}
          </select>

          {/* Monthly / Annual toggle */}
          <div style={{ display: 'flex', background: surface, border: `1px solid ${border}`, borderRadius: 10, padding: 4, gap: 4 }}>
            {(['month', 'year'] as const).map(iv => (
              <button key={iv} onClick={() => setInterval(iv)}
                style={{ background: interval === iv ? teal : 'transparent', border: 'none', borderRadius: 7, padding: '7px 18px', color: interval === iv ? 'white' : text3, fontSize: 13, fontWeight: interval === iv ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s' }}>
                {iv === 'month' ? 'Monthly' : 'Annual'}
                {iv === 'year' && <span style={{ marginLeft: 6, background: '#4ADE8020', border: '1px solid #4ADE8040', borderRadius: 10, padding: '1px 7px', fontSize: 10, color: '#4ADE80' }}>Save 20%</span>}
              </button>
            ))}
          </div>

          {/* Promo code */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={promo} onChange={e => setPromo(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && applyPromo()}
              placeholder="Promo code"
              style={{ ...inp, fontSize: 13, padding: '8px 12px', width: 130 }} />
            <button onClick={applyPromo}
              style={{ background: promoApplied ? '#4ADE8020' : surface, border: `1px solid ${promoApplied ? '#4ADE80' : border}`, borderRadius: 8, padding: '8px 14px', color: promoApplied ? '#4ADE80' : text2, fontSize: 13, cursor: 'pointer' }}>
              {promoApplied ? '✓ Applied' : 'Apply'}
            </button>
            {promoError && <span style={{ color: '#F87171', fontSize: 12 }}>{promoError}</span>}
          </div>
        </div>

        {/* Plan cards */}
        {loadingPlans ? (
          <div style={{ textAlign: 'center', color: text3, padding: 40 }}>Loading pricing...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, alignItems: 'start' }}>
            {plans.map((plan, i) => {
              const isPopular = plan.code === 'professional'
              const isEnterprise = plan.code === 'enterprise'
              return (
                <div key={plan.code} style={{ background: isPopular ? `rgba(14,165,160,0.08)` : surface, border: `2px solid ${isPopular ? teal : border}`, borderRadius: 14, padding: 28, position: 'relative' }}>
                  {isPopular && <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: teal, color: 'white', fontSize: 11, fontWeight: 700, padding: '4px 16px', borderRadius: 20, whiteSpace: 'nowrap' }}>MOST POPULAR</div>}

                  <div style={{ color: text1, fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{plan.name}</div>
                  <div style={{ color: text3, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{plan.description}</div>

                  {!isEnterprise ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                        <span style={{ color: text1, fontSize: 40, fontWeight: 700, lineHeight: 1 }}>{plan.price.display}</span>
                        <span style={{ color: text3, fontSize: 14 }}>/{interval === 'year' ? 'year' : 'mo'}</span>
                      </div>
                      {interval === 'year' && <div style={{ color: '#4ADE80', fontSize: 12, marginBottom: 4 }}>{plan.price.monthlyEquiv} · {plan.price.annualSaving}</div>}
                      {plan.price.promoDiscount > 0 && <div style={{ color: '#F59E0B', fontSize: 12, marginBottom: 4 }}>🎟 Promo applied</div>}
                    </>
                  ) : (
                    <div style={{ color: text1, fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Custom</div>
                  )}

                  <div style={{ color: text3, fontSize: 12, marginBottom: 24 }}>
                    Up to {plan.maxUsers} users · {typeof plan.maxBatches === 'number' && plan.maxBatches > 10000 ? 'Unlimited' : plan.maxBatches} runs/mo
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                    {(Array.isArray(plan.features) ? plan.features : []).map((f: string) => (
                      <div key={f} style={{ display: 'flex', gap: 8, fontSize: 13, color: text2 }}>
                        <span style={{ color: tealL, flexShrink: 0 }}>✓</span>{f}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => isEnterprise ? handleEnterprise() : handleCheckout(plan)}
                    disabled={checkingOut === plan.code}
                    style={{ width: '100%', background: isPopular ? teal : checkingOut === plan.code ? '#172035' : '#172035', border: `1px solid ${isPopular ? 'transparent' : border}`, borderRadius: 9, padding: '13px', color: checkingOut === plan.code ? text3 : 'white', fontSize: 14, fontWeight: 600, cursor: checkingOut === plan.code ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
                    {checkingOut === plan.code ? 'Loading...' : isEnterprise ? 'Contact sales →' : 'Start free trial →'}
                  </button>
                </div>
              )
            })}

            {/* Fallback if no plans loaded from DB */}
            {plans.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', color: text3, padding: 32 }}>
                <p>Pricing unavailable. <a href="/signup" style={{ color: tealL }}>Start your free trial →</a></p>
              </div>
            )}
          </div>
        )}

        {/* FAQ */}
        <div style={{ maxWidth: 700, margin: '56px auto 0' }}>
          <h3 style={{ color: text1, fontSize: 20, fontWeight: 400, textAlign: 'center', marginBottom: 28 }}>Frequently asked questions</h3>
          {[
            { q: 'What happens after my trial ends?', a: 'You\'ll be prompted to choose a plan. Your data is preserved and you can continue with full access after subscribing. If you don\'t subscribe, your account is suspended (not deleted) for 30 days.' },
            { q: 'Can I change plans later?', a: 'Yes — upgrade or downgrade at any time. Upgrades take effect immediately, downgrades at the next billing cycle. All managed via the Stripe billing portal.' },
            { q: 'Do you offer annual billing?', a: 'Yes — save 20% by paying annually. Switch between monthly and annual at any time via your billing portal.' },
            { q: 'Is my data secure?', a: 'Yes. Data is encrypted at rest (AES-256) and in transit (TLS 1.3). Full org isolation — tenants cannot access each other\'s data. SHA-256 tamper-evident audit chain on all events.' },
            { q: 'What ERP systems do you support?', a: 'SAP (FIDCC2 IDOC), Oracle AR (AutoLockbox), NetSuite, Xero, and generic CSV/JSON. Custom connectors available on Enterprise.' },
            { q: 'Can I use my own API key for Claude?', a: 'No — the AI key is managed server-side for security. Your Anthropic usage is included in your CashFlow AI subscription.' },
          ].map(faq => (
            <details key={faq.q} style={{ background: surface, border: `1px solid ${border}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
              <summary style={{ padding: '14px 18px', cursor: 'pointer', color: text1, fontSize: 14, fontWeight: 500, listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {faq.q} <span style={{ color: text3 }}>+</span>
              </summary>
              <div style={{ padding: '0 18px 16px', color: text3, fontSize: 13, lineHeight: 1.7 }}>{faq.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* Security strip */}
      <section style={{ background: surface, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, padding: '40px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
          {[
            { icon: '🔐', label: 'SHA-256 Audit Chain' },
            { icon: '🏢', label: 'Full Org Isolation' },
            { icon: '🔒', label: 'AES-256 Encryption' },
            { icon: '🇦🇺', label: 'AU Data Residency' },
            { icon: '⏱', label: '8-Hour Sessions' },
            { icon: '🚦', label: 'Rate Limited APIs' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, color: text3, fontSize: 13 }}>
              <span style={{ fontSize: 18 }}>{s.icon}</span>{s.label}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 40px' }}>
        <div style={{ background: `rgba(14,165,160,0.08)`, border: `1px solid ${teal}40`, borderRadius: 20, padding: '64px 48px', textAlign: 'center' }}>
          <h2 style={{ color: text1, fontSize: 38, fontWeight: 300, margin: '0 0 16px' }}>Start automating your cash application today</h2>
          <p style={{ color: text3, fontSize: 16, marginBottom: 36, maxWidth: 500, margin: '0 auto 36px' }}>Join AR teams across Australia and New Zealand. Up and running in 30 seconds.</p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
            <a href="/signup" style={{ background: teal, color: 'white', textDecoration: 'none', padding: '15px 36px', borderRadius: 10, fontSize: 16, fontWeight: 700 }}>Start free trial →</a>
            <a href="mailto:sales@hindleconsultants.com.au" style={{ background: 'transparent', color: text2, textDecoration: 'none', padding: '15px 32px', borderRadius: 10, fontSize: 16, border: `1px solid ${border}` }}>Talk to sales</a>
          </div>
          <div style={{ color: text3, fontSize: 13, marginTop: 20 }}>14-day free trial · No credit card · Cancel anytime</div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${border}`, padding: '36px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⬡</span>
            <span style={{ color: text1, fontWeight: 700 }}>CashFlow AI</span>
            <span style={{ color: text3, fontSize: 13 }}>by Hindle Consultants · Kuhlekt</span>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <a href="#pricing" style={{ color: text3, fontSize: 13, textDecoration: 'none' }}>Pricing</a>
            <a href="/login" style={{ color: text3, fontSize: 13, textDecoration: 'none' }}>Sign in</a>
            <a href="/signup" style={{ color: text3, fontSize: 13, textDecoration: 'none' }}>Sign up</a>
            <a href="/admin" style={{ color: text3, fontSize: 13, textDecoration: 'none' }}>Admin</a>
            <a href="mailto:sales@hindleconsultants.com.au" style={{ color: text3, fontSize: 13, textDecoration: 'none' }}>Contact</a>
          </div>
          <span style={{ color: text3, fontSize: 12 }}>© 2026 Hindle Consultants Pty Ltd · All rights reserved</span>
        </div>
      </footer>

    </div>
  )
}
