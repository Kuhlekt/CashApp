'use client'
import { useState, FormEvent, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function SignupForm() {
  const params = useSearchParams()
  const planParam    = params.get('plan') ?? ''
  const currencyParam = params.get('currency') ?? 'AUD'
  const intervalParam = params.get('interval') ?? 'month'
  const promoParam   = params.get('promo') ?? ''
  const emailParam   = params.get('email') ?? ''

  const [form, setForm] = useState({
    orgName: '', adminName: '', email: emailParam, password: ''
  })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')

    const res = await fetch('/api/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, plan: 'trial' }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Registration failed')
      setLoading(false)
      return
    }

    // If they came from pricing with a plan — sign them in then go to checkout
    if (planParam) {
      // Sign in automatically
      const { signIn } = await import('next-auth/react')
      const authResult = await signIn('credentials', {
        email: form.email,
        password: form.password,
        redirect: false,
      })

      if (authResult?.ok) {
        // Go to Stripe checkout
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
      }
      // Fallback to login if checkout fails
      window.location.href = '/login'
      return
    }

    // Trial signup — go to login
    window.location.href = `/login?email=${encodeURIComponent(form.email)}&welcome=1`
  }

  const inp = { width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', color: 'white', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none', marginBottom: 12 }
  const lbl = { display: 'block', color: '#94a3b8', fontSize: 12, marginBottom: 6 }
  const teal = '#0d9488'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020817', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⬡</div>
          <div style={{ color: 'white', fontSize: 22, fontWeight: 600 }}>
            {planParam ? `Start ${planParam} plan` : 'Start free trial'}
          </div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            {planParam
              ? `14-day free trial · then ${currencyParam} billing`
              : '14 days free · No credit card required'}
          </div>
        </div>

        {planParam && (
          <div style={{ background: 'rgba(14,165,160,0.08)', border: '1px solid rgba(14,165,160,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#2DD4BF' }}>
            ✓ After trial: {planParam.charAt(0).toUpperCase() + planParam.slice(1)} plan · {intervalParam === 'year' ? 'Annual' : 'Monthly'} billing · {currencyParam}
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
          <input style={inp} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" required />

          {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 12px', color: '#f87171', fontSize: 13, marginBottom: 12 }}>⚠ {error}</div>}

          <button type="submit" disabled={loading} style={{ width: '100%', background: loading ? '#1e293b' : teal, border: 'none', borderRadius: 8, padding: 12, color: loading ? '#64748b' : 'white', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}>
            {loading ? (planParam ? 'Setting up account...' : 'Creating account...') : (planParam ? `Start trial & checkout →` : 'Start free trial →')}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a href="/login" style={{ color: '#64748b', fontSize: 12 }}>Already have an account? Sign in</a>
        </div>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <a href="/landing#pricing" style={{ color: '#64748b', fontSize: 12 }}>← Back to pricing</a>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return <Suspense><SignupForm /></Suspense>
}
