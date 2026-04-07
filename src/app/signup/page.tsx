'use client'
import { useState, FormEvent, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'

function SignupForm() {
  const params        = useSearchParams()
  const planParam     = params.get('plan') ?? ''
  const currencyParam = params.get('currency') ?? 'AUD'
  const intervalParam = params.get('interval') ?? 'month'
  const promoParam    = params.get('promo') ?? ''
  const emailParam    = params.get('email') ?? ''

  const [form, setForm]     = useState({ orgName: '', adminName: '', email: emailParam, password: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus]   = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true); setError(''); setStatus('Creating your account...')

    // Step 1: Register org
    const res = await fetch('/api/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgName: form.orgName, adminName: form.adminName, email: form.email, password: form.password, plan: 'trial' }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Registration failed')
      setLoading(false); setStatus('')
      return
    }

    setStatus('Signing you in...')

    // Step 2: Sign in using next-auth signIn
    const authResult = await signIn('credentials', {
      email: form.email,
      password: form.password,
      redirect: false,
    })

    if (!authResult?.ok) {
      // Registered but auth failed — redirect to login
      setStatus('Account created! Redirecting to login...')
      setTimeout(() => { window.location.href = `/login?email=${encodeURIComponent(form.email)}` }, 1000)
      return
    }

    // Step 3: If plan selected → Stripe checkout
    if (planParam) {
      setStatus('Redirecting to checkout...')
      try {
        const checkoutRes = await fetch('/api/billing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'checkout',
            planCode: planParam,
            currency: currencyParam,
            interval: intervalParam,
            promoCode: promoParam || undefined,
          }),
        })
        const checkoutData = await checkoutRes.json()
        if (checkoutData.url) {
          window.location.href = checkoutData.url
          return
        }
      } catch {}
    }

    // Step 4: No plan or checkout failed → go to app
    setStatus('Done! Taking you to the app...')
    window.location.href = '/app'
  }

  const teal = '#0d9488'
  const inp = { width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', color: 'white', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none', marginBottom: 12 }
  const lbl = { display: 'block', color: '#94a3b8', fontSize: 12, marginBottom: 6 }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020817', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⬡</div>
          <div style={{ color: 'white', fontSize: 22, fontWeight: 600 }}>
            {planParam ? `Start ${planParam} plan` : 'Start free trial'}
          </div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            {planParam
              ? `14-day trial · then ${currencyParam} ${intervalParam === 'year' ? 'annual' : 'monthly'} billing`
              : '14 days free · No credit card required'}
          </div>
        </div>

        {planParam && (
          <div style={{ background: 'rgba(14,165,160,0.08)', border: '1px solid rgba(14,165,160,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#2DD4BF' }}>
            ✓ {planParam.charAt(0).toUpperCase() + planParam.slice(1)} · {intervalParam === 'year' ? 'Annual' : 'Monthly'} · {currencyParam}
            {promoParam && ` · Promo: ${promoParam}`}
          </div>
        )}

        <form onSubmit={submit}>
          <label style={lbl}>Company name</label>
          <input style={inp} value={form.orgName} onChange={e => setForm(f => ({ ...f, orgName: e.target.value }))} placeholder="Acme Corp" required />
          <label style={lbl}>Your full name</label>
          <input style={inp} value={form.adminName} onChange={e => setForm(f => ({ ...f, adminName: e.target.value }))} placeholder="Jane Smith" required />
          <label style={lbl}>Work email</label>
          <input style={inp} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" required />
          <label style={lbl}>Password (min 8 characters)</label>
          <input style={inp} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" minLength={8} required />

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 12px', color: '#f87171', fontSize: 13, marginBottom: 12 }}>
              ⚠ {error}
            </div>
          )}

          {status && !error && (
            <div style={{ background: 'rgba(14,165,160,0.08)', border: '1px solid rgba(14,165,160,0.2)', borderRadius: 8, padding: '10px 12px', color: '#2DD4BF', fontSize: 13, marginBottom: 12 }}>
              ⟳ {status}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ width: '100%', background: loading ? '#1e293b' : teal, border: 'none', borderRadius: 8, padding: 13, color: loading ? '#64748b' : 'white', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? status || 'Working...' : planParam ? 'Create account & checkout →' : 'Start free trial →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 16, display: 'flex', justifyContent: 'center', gap: 20 }}>
          <a href="/login" style={{ color: '#64748b', fontSize: 12 }}>Already have an account?</a>
          {planParam && <a href="/landing#pricing" style={{ color: '#64748b', fontSize: 12 }}>← Back to pricing</a>}
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return <Suspense><SignupForm /></Suspense>
}
