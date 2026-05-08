'use client'
import { useState, useEffect } from 'react'

const C = { bg:'#060A14', surface:'#0D1526', surface2:'#172035', border:'#324D72', text1:'#F8FAFF', text2:'#C4D3E8', text3:'#8899B8', teal:'#0EA5A0', tealL:'#2DD4BF' }
const CURR_SYM:Record<string,string> = { AUD:'A$', USD:'$', NZD:'NZ$', GBP:'\u00a3', EUR:'\u20ac' }
const CURRENCIES = ['AUD','USD','NZD','GBP','EUR']

const STATIC_PLANS = [
  { code:'starter', name:'Starter', desc:'For AR teams getting started',
    features:['AI invoice matching','SFTP/URL file pickup','SAP IDOC & CSV export','Email notifications','Audit trail'],
    prices:{ AUD:{month:110,year:1056}, USD:{month:70,year:672}, NZD:{month:115,year:1104}, GBP:{month:55,year:528}, EUR:{month:65,year:624} } },
  { code:'professional', name:'Professional', desc:'For growing teams with complex matching needs',
    features:['Everything in Starter','ML learning engine','Multi-region routing','Dual approval flows','Priority support'],
    prices:{ AUD:{month:385,year:3696}, USD:{month:250,year:2400}, NZD:{month:410,year:3936}, GBP:{month:195,year:1872}, EUR:{month:230,year:2208} } },
  { code:'enterprise', name:'Enterprise', desc:'For large organisations with custom requirements',
    features:['Everything in Professional','Custom ERP connectors','Dedicated infrastructure','SLA guarantee','ISO 27001 ready'],
    prices:{ AUD:{month:1085,year:10416}, USD:{month:700,year:6720}, NZD:{month:1155,year:11088}, GBP:{month:545,year:5232}, EUR:{month:645,year:6192} } },
]

const FEATURES = [
  { icon:'*', title:'AI-Powered Matching', desc:'Claude AI matches bank transactions to invoices with 95%+ accuracy. ML learns from every confirmation.' },
  { icon:'~', title:'Fully Automated', desc:'Schedule nightly runs via SFTP, URL, or S3. Process, match, and deliver to your ERP while you sleep.' },
  { icon:'#', title:'Governed & Auditable', desc:'SHA-256 hash chain on every event. Dual approval, threshold controls, immutable audit trail.' },
  { icon:'@', title:'ERP Integration', desc:'SAP IDOC, Oracle AR, NetSuite, Xero, CSV. Deliver via SFTP, S3, or REST API.' },
  { icon:'%', title:'Multi-Region', desc:'Route by region with separate bank accounts and currencies per region.' },
  { icon:'!', title:'Smart Notifications', desc:'ClickSend email and SMS on batch completion, exceptions, approvals and ERP readiness.' },
]

export default function LandingPage() {
  const [email, setEmail]             = useState('')
  const [currency, setCurrency]       = useState('AUD')
  const [interval, setInterval]       = useState<'month'|'year'>('month')
  const [promo, setPromo]             = useState('')
  const [promoMsg, setPromoMsg]       = useState('')
  const [promoValid, setPromoValid]   = useState(false)
  const [checkingOut, setCheckingOut] = useState('')
  const [livePlans, setLivePlans]     = useState<any[]>([])
  const [annualPct, setAnnualPct]     = useState(20)

  useEffect(() => {
    const params = new URLSearchParams({ currency, interval })
    if (promoValid && promo) params.set('promo', promo.toUpperCase())
    fetch('/api/pricing?' + params.toString())
      .then(r => r.json())
      .then(d => {
        if (d.plans?.length) {
          setLivePlans(d.plans)
          const pct = d.plans[0]?.price?.discountPct
          if (pct > 0) setAnnualPct(pct)
        }
      })
      .catch(() => {})
  }, [currency, interval, promoValid, promo])

  const sym = CURR_SYM[currency] ?? '$'

  function getPrice(planCode: string, staticPlan: typeof STATIC_PLANS[0]): number {
    const live = livePlans.find(p => p.code === planCode)
    if (live?.price?.amount) return Math.round(live.price.amount / 100)
    const prices = staticPlan.prices[currency as keyof typeof staticPlan.prices] ?? staticPlan.prices.AUD
    return interval === 'year' ? prices.year : prices.month
  }

  function getLimits(planCode: string): { users: number|null, batches: number|null } {
    const live = livePlans.find(p => p.code === planCode)
    if (live) return { users: live.maxUsers ?? null, batches: live.maxBatches ?? null }
    return { users: null, batches: null }
  }

  async function applyPromo() {
    if (!promo.trim()) return
    try {
      const r = await fetch('/api/pricing?currency=' + currency + '&interval=' + interval + '&promo=' + promo.trim().toUpperCase())
      if (r.ok) { setPromoValid(true); setPromoMsg(promo.toUpperCase() + ' applied') }
      else { const d = await r.json(); setPromoValid(false); setPromoMsg(d.error ?? 'Invalid code') }
    } catch { setPromoMsg('Could not validate') }
  }

  async function handleCheckout(planCode: string) {
    if (planCode === 'enterprise') { window.location.href = 'mailto:sales@hindleconsultants.com.au?subject=Enterprise enquiry'; return }
    setCheckingOut(planCode)
    try {
      const r = await fetch('/api/billing', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'checkout', planCode, currency, interval, promoCode: promoValid ? promo.toUpperCase() : undefined }) })
      if (r.ok) { const d = await r.json(); if (d.url) { window.location.href = d.url; return } }
    } catch {}
    const p = new URLSearchParams({ plan: planCode, currency, interval })
    if (promoValid) p.set('promo', promo.toUpperCase())
    window.location.href = '/signup?' + p.toString()
    setCheckingOut('')
  }

  const inp = { background: C.surface, border: '1px solid ' + C.border, borderRadius: 10, padding: '11px 16px', color: C.text1, fontSize: 14, outline: 'none', fontFamily: 'inherit' } as React.CSSProperties

  return (
    <div style={{ background: C.bg, color: C.text2, fontFamily: 'system-ui,-apple-system,sans-serif', minHeight: '100vh' }}>

      <nav style={{ position:'sticky', top:0, zIndex:100, background:'rgba(6,10,20,0.95)', backdropFilter:'blur(12px)', borderBottom:'1px solid ' + C.border, padding:'0 40px', height:64, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:22 }}>&#x2B21;</span>
          <span style={{ color:C.text1, fontWeight:700, fontSize:17 }}>CashFlow AI</span>
          <span style={{ background:'rgba(14,165,160,0.15)', border:'1px solid rgba(14,165,160,0.35)', borderRadius:20, padding:'2px 10px', fontSize:10, color:C.tealL, fontWeight:700 }}>BY HINDLE CONSULTANTS</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <a href="#features" style={{ color:C.text3, fontSize:14, textDecoration:'none' }}>Features</a>
          <a href="#pricing" style={{ color:C.text3, fontSize:14, textDecoration:'none' }}>Pricing</a>
          <a href="#faq" style={{ color:C.text3, fontSize:14, textDecoration:'none' }}>FAQ</a>
          <a href="/login" style={{ color:C.text2, fontSize:14, textDecoration:'none', padding:'8px 16px', border:'1px solid ' + C.border, borderRadius:8 }}>Sign in</a>
          <a href="/signup" style={{ color:'white', fontSize:14, textDecoration:'none', padding:'8px 18px', background:C.teal, borderRadius:8, fontWeight:600 }}>Free trial</a>
        </div>
      </nav>

      <section style={{ maxWidth:1100, margin:'0 auto', padding:'100px 40px 80px', textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(14,165,160,0.12)', border:'1px solid rgba(14,165,160,0.3)', borderRadius:20, padding:'6px 16px', fontSize:12, color:C.tealL, marginBottom:28, fontWeight:600 }}>
          AI-powered cash application for accounts receivable teams
        </div>
        <h1 style={{ color:C.text1, fontSize:56, fontWeight:300, lineHeight:1.12, margin:'0 0 24px', letterSpacing:'-0.03em' }}>
          <span style={{ color:C.tealL }}>AI-powered</span><br />cash application
        </h1>
        <p style={{ fontSize:19, color:C.text2, maxWidth:600, margin:'0 auto 44px', lineHeight:1.7 }}>
          Automatically match bank transactions to invoices with 95%+ accuracy. Automated nightly runs. Direct ERP export to SAP, Oracle, NetSuite, or Xero.
        </p>
        <form onSubmit={e => { e.preventDefault(); window.location.href = '/signup?email=' + encodeURIComponent(email) }}
          style={{ display:'flex', gap:10, maxWidth:440, margin:'0 auto 20px', justifyContent:'center' }}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@company.com" required style={{ ...inp, flex:1 }} />
          <button type="submit" style={{ background:C.teal, border:'none', borderRadius:10, padding:'11px 24px', color:'white', fontSize:15, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>Start free</button>
        </form>
        <div style={{ color:C.text3, fontSize:13 }}>14-day free trial &middot; No credit card required &middot; Cancel anytime</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:24, maxWidth:720, margin:'64px auto 0' }}>
          {[{ v:'95%+', l:'Auto-match rate' },{ v:'$2.4M', l:'Avg cash applied/day' },{ v:'&lt; 2s', l:'Per transaction' },{ v:'100%', l:'Audit coverage' }].map(s => (
            <div key={s.l}><div style={{ color:C.tealL, fontSize:34, fontWeight:700, fontFamily:'monospace' }} dangerouslySetInnerHTML={{__html:s.v}} /><div style={{ color:C.text3, fontSize:13, marginTop:4 }}>{s.l}</div></div>
          ))}
        </div>
      </section>

      <section id="features" style={{ maxWidth:1100, margin:'0 auto', padding:'80px 40px' }}>
        <h2 style={{ textAlign:'center', color:C.text1, fontSize:36, fontWeight:300, margin:'0 0 56px' }}>AI that works while your team sleeps</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background:C.surface, border:'1px solid ' + C.border, borderRadius:12, padding:24 }}>
              <div style={{ width:36, height:36, borderRadius:8, background:'rgba(14,165,160,0.15)', display:'flex', alignItems:'center', justifyContent:'center', color:C.tealL, fontSize:16, fontWeight:700, marginBottom:14 }}>{f.icon}</div>
              <div style={{ color:C.text1, fontSize:15, fontWeight:600, marginBottom:8 }}>{f.title}</div>
              <div style={{ color:C.text3, fontSize:13, lineHeight:1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" style={{ maxWidth:1100, margin:'0 auto', padding:'80px 40px' }}>
        <h2 style={{ textAlign:'center', color:C.text1, fontSize:36, fontWeight:300, margin:'0 0 12px' }}>Simple, transparent pricing</h2>
        <p style={{ textAlign:'center', color:C.text3, fontSize:15, marginBottom:36 }}>All plans include a 14-day free trial. No credit card required.</p>

        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:12, marginBottom:36, flexWrap:'wrap' }}>
          <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inp, padding:'8px 12px', cursor:'pointer', fontSize:13 }}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ display:'flex', background:C.surface, border:'1px solid ' + C.border, borderRadius:10, padding:4 }}>
            {(['month','year'] as const).map(iv => (
              <button key={iv} onClick={() => setInterval(iv)}
                style={{ background:interval===iv ? C.teal : 'transparent', border:'none', borderRadius:7, padding:'7px 18px', color:interval===iv ? 'white' : C.text3, fontSize:13, fontWeight:interval===iv ? 700 : 400, cursor:'pointer' }}>
                {iv === 'month' ? 'Monthly' : 'Annual ' + annualPct + '% off'}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <input value={promo} onChange={e => setPromo(e.target.value.toUpperCase())} onKeyDown={e => e.key==='Enter' && applyPromo()}
              placeholder="Promo code" style={{ ...inp, padding:'8px 12px', width:130, fontSize:13 }} />
            <button onClick={applyPromo} style={{ background: promoValid ? 'rgba(74,222,128,0.15)' : C.surface, border:'1px solid ' + (promoValid ? '#4ADE80' : C.border), borderRadius:8, padding:'8px 14px', color: promoValid ? '#4ADE80' : C.text2, fontSize:13, cursor:'pointer' }}>
              {promoValid ? 'Applied' : 'Apply'}
            </button>
            {promoMsg && <span style={{ color: promoValid ? '#4ADE80' : '#F87171', fontSize:12 }}>{promoMsg}</span>}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20, alignItems:'start' }}>
          {STATIC_PLANS.map(plan => {
            const isPopular = plan.code === 'professional'
            const isEnt     = plan.code === 'enterprise'
            const price     = getPrice(plan.code, plan)
            const limits    = getLimits(plan.code)

            return (
              <div key={plan.code} style={{ background: isPopular ? 'rgba(14,165,160,0.08)' : C.surface, border:'2px solid ' + (isPopular ? C.teal : C.border), borderRadius:14, padding:28, position:'relative' }}>
                {isPopular && <div style={{ position:'absolute', top:-13, left:'50%', transform:'translateX(-50%)', background:C.teal, color:'white', fontSize:11, fontWeight:700, padding:'4px 16px', borderRadius:20, whiteSpace:'nowrap' }}>MOST POPULAR</div>}

                <div style={{ color:C.text1, fontSize:18, fontWeight:700, marginBottom:4 }}>{plan.name}</div>
                <div style={{ color:C.text3, fontSize:13, marginBottom:16, lineHeight:1.5 }}>{plan.desc}</div>

                {isEnt ? (
                  <div style={{ color:C.text1, fontSize:32, fontWeight:700, marginBottom:4 }}>Custom</div>
                ) : (
                  <>
                    <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:4 }}>
                      <span style={{ color:C.text1, fontSize:40, fontWeight:700, lineHeight:1 }}>{sym}{price}</span>
                      <span style={{ color:C.text3, fontSize:14 }}>/{interval === 'year' ? 'yr' : 'mo'}</span>
                    </div>
                    {interval === 'year' && <div style={{ color:'#4ADE80', fontSize:12, marginBottom:4 }}>Save {annualPct}%</div>}
                    {promoValid && <div style={{ color:'#F59E0B', fontSize:12, marginBottom:4 }}>Promo applied</div>}
                  </>
                )}

                <div style={{ color:C.text3, fontSize:12, marginBottom:20, minHeight:18 }}>
                  {limits.users !== null
                    ? limits.users + ' user' + (limits.users === 1 ? '' : 's') + ' &middot; ' + (limits.batches !== null && limits.batches >= 999999 ? 'Unlimited' : (limits.batches ?? '')) + ' runs/mo'
                    : livePlans.length === 0 ? 'Loading...' : ''}
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:24 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display:'flex', gap:8, fontSize:13, color:C.text2 }}>
                      <span style={{ color:C.tealL, flexShrink:0, fontWeight:700 }}>+</span>{f}
                    </div>
                  ))}
                </div>

                <button onClick={() => handleCheckout(plan.code)} disabled={checkingOut === plan.code}
                  style={{ width:'100%', background: isPopular ? C.teal : '#172035', border:'1px solid ' + (isPopular ? 'transparent' : C.border), borderRadius:9, padding:'13px', color: checkingOut===plan.code ? C.text3 : 'white', fontSize:14, fontWeight:600, cursor: checkingOut===plan.code ? 'not-allowed' : 'pointer' }}>
                  {checkingOut === plan.code ? 'Loading...' : isEnt ? 'Contact sales' : 'Start free trial'}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <section id="faq" style={{ maxWidth:700, margin:'0 auto', padding:'80px 40px' }}>
        <h2 style={{ textAlign:'center', color:C.text1, fontSize:32, fontWeight:300, margin:'0 0 40px' }}>Frequently asked questions</h2>
        {[
          { q:'What happens after my trial ends?', a:'You will be prompted to choose a plan. Your data is preserved. If you do not subscribe within 30 days your account is suspended but not deleted.' },
          { q:'Can I change plans?', a:'Yes. Upgrade or downgrade anytime. Upgrades take effect immediately, downgrades at next billing cycle via the Stripe billing portal.' },
          { q:'Do you offer annual billing?', a:'Yes. Save on annual billing. Switch anytime via your billing portal.' },
          { q:'What ERP systems do you support?', a:'SAP FIDCC2 IDOC, Oracle AR AutoLockbox, NetSuite, Xero, and generic CSV/JSON. Custom connectors on Enterprise.' },
          { q:'Is my financial data secure?', a:'Yes. AES-256 encryption at rest, TLS 1.3 in transit, full org isolation, SHA-256 tamper-evident audit chain. Global deployment via Vercel edge network.' },
          { q:'What bank file formats do you support?', a:'MT940, CAMT.053 ISO 20022, BAI2, and custom CSV with a mapping profile builder.' },
        ].map(faq => (
          <details key={faq.q} style={{ background:C.surface, border:'1px solid ' + C.border, borderRadius:10, marginBottom:8, overflow:'hidden' }}>
            <summary style={{ padding:'14px 18px', cursor:'pointer', color:C.text1, fontSize:14, fontWeight:500 }}>{faq.q}</summary>
            <div style={{ padding:'0 18px 16px', color:C.text3, fontSize:13, lineHeight:1.7 }}>{faq.a}</div>
          </details>
        ))}
      </section>

      <section style={{ maxWidth:1100, margin:'0 auto', padding:'40px 40px 80px' }}>
        <div style={{ background:'rgba(14,165,160,0.08)', border:'1px solid rgba(14,165,160,0.35)', borderRadius:20, padding:'64px 48px', textAlign:'center' }}>
          <h2 style={{ color:C.text1, fontSize:36, fontWeight:300, margin:'0 0 16px' }}>Start automating your cash application today</h2>
          <p style={{ color:C.text3, fontSize:16, marginBottom:36 }}>Trusted by accounts receivable teams worldwide.</p>
          <div style={{ display:'flex', gap:14, justifyContent:'center' }}>
            <a href="/signup" style={{ background:C.teal, color:'white', textDecoration:'none', padding:'14px 36px', borderRadius:10, fontSize:16, fontWeight:700 }}>Start free trial</a>
            <a href="mailto:sales@hindleconsultants.com.au" style={{ background:'transparent', color:C.text2, textDecoration:'none', padding:'14px 32px', borderRadius:10, fontSize:16, border:'1px solid ' + C.border }}>Talk to sales</a>
          </div>
          <div style={{ color:C.text3, fontSize:13, marginTop:20 }}>14-day free trial &middot; No credit card &middot; Cancel anytime</div>
        </div>
      </section>

      <footer style={{ borderTop:'1px solid ' + C.border, padding:'32px 40px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span>&#x2B21;</span>
            <span style={{ color:C.text1, fontWeight:700 }}>CashFlow AI</span>
            <span style={{ color:C.text3, fontSize:13 }}>by Hindle Consultants</span>
          </div>
          <div style={{ display:'flex', gap:20 }}>
            {[['#pricing','Pricing'],['#faq','FAQ'],['/login','Sign in'],['/signup','Sign up'],['/admin','Admin']].map(([href,label]) => (
              <a key={href} href={href} style={{ color:C.text3, fontSize:13, textDecoration:'none' }}>{label}</a>
            ))}
          </div>
          <span style={{ color:C.text3, fontSize:12 }}>2026 Hindle Consultants Pty Ltd</span>
        </div>
      </footer>
    </div>
  )
}
