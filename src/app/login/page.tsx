'use client'
import { useState, FormEvent } from 'react'
import { signIn } from 'next-auth/react'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true); setError('')
    const result = await signIn('credentials', { email, password, redirect: false })
    if (result?.error || !result?.ok) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      window.location.href = '/app'
    }
  }

  const inp = { width:'100%', background:'#1e293b', border:'1px solid #334155', borderRadius:8, padding:'10px 12px', color:'white', fontSize:14, boxSizing:'border-box' as const, outline:'none' }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#020817' }}>
      <div style={{ width:380, background:'#0f172a', border:'1px solid #1e293b', borderRadius:12, padding:32 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:36 }}>⬡</div>
          <div style={{ color:'white', fontSize:22, fontWeight:600 }}>CashFlow AI</div>
          <div style={{ color:'#64748b', fontSize:13, marginTop:4 }}>Hindle Consultants · Kuhlekt</div>
        </div>
        <form onSubmit={submit}>
          <div style={{ marginBottom:12 }}>
            <label style={{ display:'block', color:'#94a3b8', fontSize:12, marginBottom:6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} placeholder="you@company.com" required autoFocus />
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <label style={{ color:'#94a3b8', fontSize:12 }}>Password</label>
              <a href="/reset-password" style={{ color:'#0EA5A0', fontSize:11 }}>Forgot password?</a>
            </div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inp} placeholder="••••••••" required />
          </div>
          {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'10px 12px', color:'#f87171', fontSize:13, marginBottom:12 }}>⚠ {error}</div>}
          <button type="submit" disabled={loading} style={{ width:'100%', background:loading?'#1e293b':'#0d9488', border:'none', borderRadius:8, padding:'12px', color:loading?'#64748b':'white', fontSize:14, fontWeight:600, cursor:loading?'not-allowed':'pointer' }}>
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
        </form>
        <div style={{ textAlign:'center', marginTop:16, display:'flex', justifyContent:'center', gap:16 }}>
          <a href="/signup" style={{ color:'#64748b', fontSize:12 }}>Create account</a>
          <span style={{ color:'#334155' }}>·</span>
          <a href="/reset-password" style={{ color:'#64748b', fontSize:12 }}>Reset password</a>
        </div>
      </div>
    </div>
  )
}
