'use client'
import { useState, FormEvent } from 'react'

export default function SignupPage() {
  const [form, setForm] = useState({ orgName: '', adminName: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true); setError(''); setSuccess('')
    const res = await fetch('/api/orgs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, plan: 'trial' }) })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Registration failed'); setLoading(false); return }
    setSuccess(`Account created! Sign in at /login with ${form.email}`)
    setLoading(false)
  }

  const inp = { width:'100%', background:'#1e293b', border:'1px solid #334155', borderRadius:8, padding:'10px 12px', color:'white', fontSize:14, boxSizing:'border-box' as const, outline:'none', marginBottom:12 }
  const lbl = { display:'block', color:'#94a3b8', fontSize:12, marginBottom:6 }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#020817' }}>
      <div style={{ width:400, background:'#0f172a', border:'1px solid #1e293b', borderRadius:12, padding:32 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:36 }}>⬡</div>
          <div style={{ color:'white', fontSize:22, fontWeight:600 }}>Start free trial</div>
          <div style={{ color:'#64748b', fontSize:13, marginTop:4 }}>14 days free · No credit card required</div>
        </div>
        {success ? (
          <div style={{ background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.3)', borderRadius:8, padding:16, color:'#4ade80', fontSize:13 }}>
            ✓ {success}<br/><br/><a href="/login" style={{ color:'#2dd4bf' }}>Go to login →</a>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label style={lbl}>Company name</label>
            <input style={inp} value={form.orgName} onChange={e => setForm(f => ({...f, orgName: e.target.value}))} placeholder="Acme Corp" required />
            <label style={lbl}>Your name</label>
            <input style={inp} value={form.adminName} onChange={e => setForm(f => ({...f, adminName: e.target.value}))} placeholder="Jane Smith" required />
            <label style={lbl}>Work email</label>
            <input style={inp} type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="jane@company.com" required />
            <label style={lbl}>Password (min 8 characters)</label>
            <input style={inp} type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} placeholder="••••••••" required />
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'10px 12px', color:'#f87171', fontSize:13, marginBottom:12 }}>⚠ {error}</div>}
            <button type="submit" disabled={loading} style={{ width:'100%', background:loading?'#1e293b':'#0d9488', border:'none', borderRadius:8, padding:12, color:loading?'#64748b':'white', fontSize:14, fontWeight:600, cursor:loading?'not-allowed':'pointer' }}>
              {loading ? 'Creating account...' : 'Start free trial →'}
            </button>
            <div style={{ textAlign:'center', marginTop:16 }}>
              <a href="/login" style={{ color:'#64748b', fontSize:12 }}>Already have an account? Sign in</a>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
