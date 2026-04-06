'use client'
// Zero external CSS dependencies — all inline styles
// No Tailwind classes, no globals.css needed

import { useState, FormEvent } from 'react'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/callback/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email, password, csrfToken: await getCsrfToken() }),
        redirect: 'follow',
      })

      if (res.ok || res.redirected) {
        window.location.href = '/dashboard'
      } else {
        setError('Invalid email or password')
        setLoading(false)
      }
    } catch {
      // Fallback — direct form submit approach
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = '/api/auth/signin/credentials'
      ;[['email', email], ['password', password], ['callbackUrl', '/dashboard']].forEach(([k, v]) => {
        const inp = document.createElement('input')
        inp.type = 'hidden'; inp.name = k; inp.value = v
        form.appendChild(inp)
      })
      document.body.appendChild(form)
      form.submit()
    }
  }

  async function getCsrfToken(): Promise<string> {
    try {
      const r = await fetch('/api/auth/csrf')
      const d = await r.json()
      return d.csrfToken ?? ''
    } catch { return '' }
  }

  const s = {
    page:   { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#020817' } as React.CSSProperties,
    box:    { width:360, background:'#0f172a', border:'1px solid #1e293b', borderRadius:12, padding:32 } as React.CSSProperties,
    logo:   { textAlign:'center' as const, marginBottom:24 },
    icon:   { fontSize:36, marginBottom:8 },
    title:  { color:'white', fontSize:22, fontWeight:600, margin:0 },
    sub:    { color:'#64748b', fontSize:13, marginTop:4 },
    label:  { display:'block', color:'#94a3b8', fontSize:12, marginBottom:6 },
    input:  { width:'100%', background:'#1e293b', border:'1px solid #334155', borderRadius:8, padding:'10px 12px', color:'white', fontSize:14, boxSizing:'border-box' as const, outline:'none' },
    btn:    { width:'100%', background:'#0d9488', border:'none', borderRadius:8, padding:'12px', color:'white', fontSize:14, fontWeight:600, cursor:'pointer', marginTop:8 } as React.CSSProperties,
    btnOff: { width:'100%', background:'#1e293b', border:'none', borderRadius:8, padding:'12px', color:'#64748b', fontSize:14, fontWeight:600, cursor:'not-allowed', marginTop:8 } as React.CSSProperties,
    err:    { background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'10px 12px', color:'#f87171', fontSize:13, marginBottom:12 },
    hint:   { marginTop:16, padding:12, background:'rgba(14,165,160,0.05)', border:'1px solid rgba(14,165,160,0.15)', borderRadius:8 },
    mono:   { color:'#475569', fontSize:11, fontFamily:'monospace', marginTop:2 },
  }

  return (
    <div style={s.page}>
      <div style={s.box}>
        <div style={s.logo}>
          <div style={s.icon}>⬡</div>
          <div style={s.title}>CashFlow AI</div>
          <div style={s.sub}>Hindle Consultants · Kuhlekt</div>
        </div>

        <form onSubmit={submit} autoComplete="off">
          <div style={{ marginBottom:12 }}>
            <label style={s.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={s.input}
              placeholder="admin@hindleconsultants.com.au"
              required
              autoComplete="username"
            />
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={s.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={s.input}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
          {error && <div style={s.err}>⚠ {error}</div>}
          <button type="submit" style={loading ? s.btnOff : s.btn} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
        </form>

        <div style={s.hint}>
          <div style={{ color:'#64748b', fontSize:11 }}>Default credentials</div>
          <div style={s.mono}>admin@hindleconsultants.com.au</div>
          <div style={s.mono}>CashFlow2024!</div>
        </div>
      </div>
    </div>
  )
}
