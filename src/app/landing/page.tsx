'use client'
import { useState } from 'react'

const FEATURES = [
  { icon: '⊛', title: 'AI-Powered Matching', desc: 'Claude AI matches bank transactions to invoices with 95%+ accuracy. ML learns from every confirmation.' },
  { icon: '⚙', title: 'Fully Automated', desc: 'Schedule nightly runs to pick up bank files via SFTP, URL, or S3. Deliver to ERP while you sleep.' },
  { icon: '◈', title: 'Governed & Auditable', desc: 'SHA-256 hash chain on every event. Dual approval, threshold controls, complete audit trail.' },
  { icon: '⬢', title: 'ERP Integration', desc: 'SAP IDOC, Oracle AR, NetSuite, Xero, CSV. Deliver via SFTP, S3, or REST API.' },
  { icon: '◉', title: 'Multi-Region', desc: 'Route debtors by region — NSW, VIC, QLD, NZ. Separate accounts and currencies per region.' },
  { icon: '✉', title: 'Smart Notifications', desc: 'ClickSend email and SMS on batch completion, exceptions, approvals, and ERP readiness.' },
]

const PRICING = [
  { name: 'Starter', price: 99, users: 10, batches: '200/mo', features: ['AI matching', 'SFTP pickup', 'ERP export', 'Email alerts', '10 users'], highlight: false },
  { name: 'Professional', price: 349, users: 50, batches: '2,000/mo', features: ['Everything in Starter', 'Multi-region routing', 'ML learning engine', 'Dual approval', 'Priority support', '50 users'], highlight: true },
  { name: 'Enterprise', price: 999, users: 200, batches: 'Unlimited', features: ['Everything in Professional', 'Custom ERP connectors', 'Dedicated instance', 'SLA guarantee', 'ISO 27001', '200 users'], highlight: false },
]

export default function LandingPage() {
  const [email, setEmail] = useState('')
  const teal = '#0EA5A0', tealL = '#2DD4BF', surface = '#0D1526', border = '#324D72'
  const text1 = '#F8FAFF', text2 = '#C4D3E8', text3 = '#8899B8', bg = '#060A14'

  return (
    <div style={{ background: bg, color: text2, fontFamily: 'system-ui,sans-serif', minHeight: '100vh' }}>

      {/* Nav */}
      <nav style={{ position:'sticky', top:0, zIndex:100, background:'rgba(6,10,20,0.92)', backdropFilter:'blur(12px)', borderBottom:`1px solid ${border}`, padding:'0 40px', height:64, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:22 }}>⬡</span>
          <span style={{ color:text1, fontWeight:700, fontSize:17 }}>CashFlow AI</span>
          <span style={{ background:`${teal}20`, border:`1px solid ${teal}40`, borderRadius:20, padding:'2px 10px', fontSize:10, color:tealL, fontWeight:700 }}>BETA</span>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <a href="/login" style={{ color:text2, fontSize:14, textDecoration:'none', padding:'8px 16px', border:`1px solid ${border}`, borderRadius:8 }}>Sign in</a>
          <a href="/signup" style={{ color:'white', fontSize:14, textDecoration:'none', padding:'8px 18px', background:teal, borderRadius:8, fontWeight:600 }}>Free trial</a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth:1100, margin:'0 auto', padding:'100px 40px 80px', textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:`${teal}15`, border:`1px solid ${teal}30`, borderRadius:20, padding:'6px 16px', fontSize:12, color:tealL, marginBottom:28, fontWeight:600 }}>
          Built for ANZ accounts receivable teams
        </div>
        <h1 style={{ color:text1, fontSize:54, fontWeight:300, lineHeight:1.15, margin:'0 0 24px', letterSpacing:'-0.02em' }}>
          Cash application<br /><span style={{ color:tealL }}>powered by AI</span>
        </h1>
        <p style={{ fontSize:18, color:text2, maxWidth:560, margin:'0 auto 40px', lineHeight:1.7 }}>
          Automatically match bank transactions to invoices with 95%+ accuracy. Schedule overnight runs. Export to SAP, Oracle, NetSuite, or Xero.
        </p>
        <form onSubmit={e => { e.preventDefault(); window.location.href = `/signup?email=${encodeURIComponent(email)}` }}
          style={{ display:'flex', gap:10, maxWidth:440, margin:'0 auto 20px', justifyContent:'center' }}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@company.com" required
            style={{ flex:1, background:surface, border:`1px solid ${border}`, borderRadius:10, padding:'13px 18px', color:text1, fontSize:15, outline:'none' }} />
          <button type="submit" style={{ background:teal, border:'none', borderRadius:10, padding:'13px 24px', color:'white', fontSize:15, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
            Start free →
          </button>
        </form>
        <div style={{ color:text3, fontSize:13 }}>14-day free trial · No credit card required · Cancel anytime</div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:24, maxWidth:700, margin:'64px auto 0' }}>
          {[{ v:'95%+', l:'Auto-match rate' }, { v:'$2.4M', l:'Avg cash applied/day' }, { v:'< 2s', l:'Per transaction' }, { v:'100%', l:'Audit coverage' }].map(s => (
            <div key={s.l}>
              <div style={{ color:tealL, fontSize:32, fontWeight:700, fontFamily:'monospace' }}>{s.v}</div>
              <div style={{ color:text3, fontSize:13, marginTop:4 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth:1100, margin:'0 auto', padding:'80px 40px' }}>
        <h2 style={{ textAlign:'center', color:text1, fontSize:36, fontWeight:300, margin:'0 0 48px' }}>Everything your AR team needs</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background:surface, border:`1px solid ${border}`, borderRadius:12, padding:24 }}>
              <div style={{ fontSize:26, marginBottom:12 }}>{f.icon}</div>
              <div style={{ color:text1, fontSize:15, fontWeight:600, marginBottom:8 }}>{f.title}</div>
              <div style={{ color:text3, fontSize:13, lineHeight:1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{ maxWidth:1100, margin:'0 auto', padding:'80px 40px' }}>
        <h2 style={{ textAlign:'center', color:text1, fontSize:36, fontWeight:300, margin:'0 0 12px' }}>Simple, transparent pricing</h2>
        <p style={{ textAlign:'center', color:text3, fontSize:15, marginBottom:48 }}>All plans include a 14-day free trial</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20, alignItems:'start' }}>
          {PRICING.map(plan => (
            <div key={plan.name} style={{ background:plan.highlight ? `rgba(14,165,160,0.08)` : surface, border:`2px solid ${plan.highlight ? teal : border}`, borderRadius:14, padding:28, position:'relative' }}>
              {plan.highlight && <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:teal, color:'white', fontSize:11, fontWeight:700, padding:'4px 14px', borderRadius:20 }}>MOST POPULAR</div>}
              <div style={{ color:text1, fontSize:18, fontWeight:700, marginBottom:4 }}>{plan.name}</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:6 }}>
                <span style={{ color:text1, fontSize:36, fontWeight:700 }}>${plan.price}</span>
                <span style={{ color:text3, fontSize:14 }}>/month</span>
              </div>
              <div style={{ color:text3, fontSize:13, marginBottom:24 }}>Up to {plan.users} users · {plan.batches}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:28 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display:'flex', gap:8, fontSize:14, color:text2 }}>
                    <span style={{ color:tealL }}>✓</span>{f}
                  </div>
                ))}
              </div>
              <a href="/signup" style={{ display:'block', textAlign:'center', background:plan.highlight ? teal : '#172035', border:`1px solid ${plan.highlight ? 'transparent' : border}`, borderRadius:9, padding:'12px', color:'white', textDecoration:'none', fontSize:14, fontWeight:600 }}>
                Start free trial
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Security */}
      <section style={{ maxWidth:1100, margin:'0 auto', padding:'80px 40px' }}>
        <div style={{ background:surface, border:`1px solid ${border}`, borderRadius:16, padding:48, display:'grid', gridTemplateColumns:'1fr 1fr', gap:48, alignItems:'center' }}>
          <div>
            <h2 style={{ color:text1, fontSize:30, fontWeight:300, margin:'0 0 16px' }}>Security built in, not bolted on</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {[
                { icon:'🔐', t:'SHA-256 audit chain', d:'Tamper-evident hash chain on every event' },
                { icon:'🏢', t:'Full org isolation', d:'Multi-tenant row-level data separation' },
                { icon:'🔒', t:'Account lockout', d:'5 failed attempts → 30 min lock' },
                { icon:'⏱', t:'Session management', d:'8-hour JWT with forced expiry' },
                { icon:'🚦', t:'Rate limiting', d:'Per-IP limits on all endpoints' },
                { icon:'✉', t:'Dual approval', d:'Two-person sign-off on high-value items' },
              ].map(i => (
                <div key={i.t} style={{ display:'flex', gap:12 }}>
                  <span style={{ fontSize:18 }}>{i.icon}</span>
                  <div><div style={{ color:text1, fontSize:14, fontWeight:600 }}>{i.t}</div><div style={{ color:text3, fontSize:13 }}>{i.d}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { l:'SOC 2 Type II', s:'In progress', c:'#f59e0b' },
              { l:'ISO 27001', s:'Planned 2026', c:'#8899B8' },
              { l:'Australian Privacy Act', s:'Compliant', c:'#4ade80' },
              { l:'Data residency (AU)', s:'Vercel syd1', c:'#4ade80' },
              { l:'Encryption at rest', s:'AES-256', c:'#4ade80' },
              { l:'Encryption in transit', s:'TLS 1.3', c:'#4ade80' },
            ].map(i => (
              <div key={i.l} style={{ background:'#0A0F1E', borderRadius:10, padding:'14px 18px', display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:text2, fontSize:14 }}>{i.l}</span>
                <span style={{ color:i.c, fontSize:13, fontWeight:600 }}>{i.s}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth:1100, margin:'0 auto', padding:'80px 40px' }}>
        <div style={{ background:`rgba(14,165,160,0.08)`, border:`1px solid ${teal}40`, borderRadius:20, padding:'64px 48px', textAlign:'center' }}>
          <h2 style={{ color:text1, fontSize:36, fontWeight:300, margin:'0 0 16px' }}>Ready to automate your cash application?</h2>
          <p style={{ color:text3, fontSize:16, marginBottom:36 }}>Join AR teams across Australia and New Zealand.</p>
          <div style={{ display:'flex', gap:14, justifyContent:'center' }}>
            <a href="/signup" style={{ background:teal, color:'white', textDecoration:'none', padding:'14px 32px', borderRadius:10, fontSize:16, fontWeight:700 }}>Start free trial →</a>
            <a href="mailto:sales@hindleconsultants.com.au" style={{ background:'transparent', color:text2, textDecoration:'none', padding:'14px 32px', borderRadius:10, fontSize:16, border:`1px solid ${border}` }}>Talk to sales</a>
          </div>
          <div style={{ color:text3, fontSize:13, marginTop:20 }}>14-day free trial · No credit card · Cancel anytime</div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop:`1px solid ${border}`, padding:'32px 40px', maxWidth:1100, margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span>⬡</span><span style={{ color:text1, fontWeight:700 }}>CashFlow AI</span>
          <span style={{ color:text3, fontSize:13 }}>by Hindle Consultants · Kuhlekt</span>
        </div>
        <div style={{ display:'flex', gap:20 }}>
          <a href="/login" style={{ color:text3, fontSize:13, textDecoration:'none' }}>Sign in</a>
          <a href="/signup" style={{ color:text3, fontSize:13, textDecoration:'none' }}>Sign up</a>
          <a href="/admin" style={{ color:text3, fontSize:13, textDecoration:'none' }}>Admin</a>
        </div>
        <span style={{ color:text3, fontSize:12 }}>© 2026 Hindle Consultants Pty Ltd</span>
      </footer>
    </div>
  )
}
