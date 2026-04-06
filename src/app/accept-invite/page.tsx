'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function AcceptInviteForm() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [form, setForm] = useState({ name: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/users/accept-invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name: form.name, password: form.password }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Failed to accept invite'); setLoading(false); return }
    setSuccess(`Account created! Welcome to ${data.org}.`)
    setLoading(false)
  }

  const inp = { width:'100%', background:'#1e293b', border:'1px solid #334155', borderRadius:8, padding:'10px 12px', color:'white', fontSize:14, boxSizing:'border-box' as const, outline:'none', marginBottom:12 }
  const lbl = { display:'block', color:'#94a3b8', fontSize:12, marginBottom:6 }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#020817' }}>
      <div style={{ width:400, background:'#0f172a', border:'1px solid #1e293b', borderRadius:12, padding:32 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:36 }}>⬡</div>
          <div style={{ color:'white', fontSize:20, fontWeight:600 }}>Accept Invitation</div>
          <div style={{ color:'#64748b', fontSize:13, marginTop:4 }}>Set up your CashFlow AI account</div>
        </div>
        {!token && <div style={{ color:'#f87171', textAlign:'center' }}>Invalid invite link</div>}
        {success ? (
          <div style={{ background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.3)', borderRadius:8, padding:16, color:'#4ade80', fontSize:13 }}>
            ✓ {success}<br/><br/><a href="/login" style={{ color:'#2dd4bf' }}>Sign in →</a>
          </div>
        ) : token && (
          <form onSubmit={submit}>
            <label style={lbl}>Your full name</label>
            <input style={inp} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Jane Smith" required />
            <label style={lbl}>Password</label>
            <input style={inp} type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} placeholder="Min 8 characters" required />
            <label style={lbl}>Confirm password</label>
            <input style={inp} type="password" value={form.confirm} onChange={e => setForm(f => ({...f, confirm: e.target.value}))} placeholder="Repeat password" required />
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'10px 12px', color:'#f87171', fontSize:13, marginBottom:12 }}>⚠ {error}</div>}
            <button type="submit" disabled={loading} style={{ width:'100%', background:loading?'#1e293b':'#0d9488', border:'none', borderRadius:8, padding:12, color:loading?'#64748b':'white', fontSize:14, fontWeight:600, cursor:loading?'not-allowed':'pointer' }}>
              {loading ? 'Creating account...' : 'Create account →'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  return <Suspense><AcceptInviteForm /></Suspense>
}
