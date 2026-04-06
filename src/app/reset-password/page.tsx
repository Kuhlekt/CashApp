'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function ResetForm() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (token && password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError('')
    const body = token ? { token, password } : { email }
    const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Request failed'); setLoading(false); return }
    setSuccess(data.message)
    setLoading(false)
  }

  const inp = { width:'100%', background:'#1e293b', border:'1px solid #334155', borderRadius:8, padding:'10px 12px', color:'white', fontSize:14, boxSizing:'border-box' as const, outline:'none', marginBottom:12 }
  const lbl = { display:'block', color:'#94a3b8', fontSize:12, marginBottom:6 }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#020817' }}>
      <div style={{ width:400, background:'#0f172a', border:'1px solid #1e293b', borderRadius:12, padding:32 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:36 }}>⬡</div>
          <div style={{ color:'white', fontSize:20, fontWeight:600 }}>{token ? 'Set new password' : 'Reset password'}</div>
        </div>
        {success ? (
          <div style={{ background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.3)', borderRadius:8, padding:16, color:'#4ade80', fontSize:13 }}>
            ✓ {success}<br/><br/><a href="/login" style={{ color:'#2dd4bf' }}>Sign in →</a>
          </div>
        ) : (
          <form onSubmit={submit}>
            {!token ? (
              <>
                <label style={lbl}>Email address</label>
                <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
              </>
            ) : (
              <>
                <label style={lbl}>New password</label>
                <input style={inp} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" required />
                <label style={lbl}>Confirm password</label>
                <input style={inp} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" required />
              </>
            )}
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'10px 12px', color:'#f87171', fontSize:13, marginBottom:12 }}>⚠ {error}</div>}
            <button type="submit" disabled={loading} style={{ width:'100%', background:loading?'#1e293b':'#0d9488', border:'none', borderRadius:8, padding:12, color:loading?'#64748b':'white', fontSize:14, fontWeight:600, cursor:loading?'not-allowed':'pointer' }}>
              {loading ? 'Processing...' : token ? 'Set password →' : 'Send reset link →'}
            </button>
            <div style={{ textAlign:'center', marginTop:12 }}>
              <a href="/login" style={{ color:'#64748b', fontSize:12 }}>Back to login</a>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return <Suspense><ResetForm /></Suspense>
}
