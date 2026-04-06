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
    setLoading(true)
    setError('')
    const result = await signIn('credentials', { email, password, redirect: false })
    if (result?.error || !result?.ok) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      window.location.href = '/cashflow-app.html'
    }
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#020817'}}>
      <div style={{width:360,background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:32}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:36}}>?</div>
          <div style={{color:'white',fontSize:22,fontWeight:600}}>CashFlow AI</div>
          <div style={{color:'#64748b',fontSize:13,marginTop:4}}>Hindle Consultants ? Kuhlekt</div>
        </div>
        <form onSubmit={submit}>
          <div style={{marginBottom:12}}>
            <label style={{display:'block',color:'#94a3b8',fontSize:12,marginBottom:6}}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
              style={{width:'100%',background:'#1e293b',border:'1px solid #334155',borderRadius:8,padding:'10px 12px',color:'white',fontSize:14,boxSizing:'border-box',outline:'none'}}
              placeholder="admin@hindleconsultants.com.au" required />
          </div>
          <div style={{marginBottom:16}}>
            <label style={{display:'block',color:'#94a3b8',fontSize:12,marginBottom:6}}>Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
              style={{width:'100%',background:'#1e293b',border:'1px solid #334155',borderRadius:8,padding:'10px 12px',color:'white',fontSize:14,boxSizing:'border-box',outline:'none'}}
              placeholder="????????" required />
          </div>
          {error && <div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:8,padding:'10px 12px',color:'#f87171',fontSize:13,marginBottom:12}}>? {error}</div>}
          <button type="submit" disabled={loading}
            style={{width:'100%',background:loading?'#1e293b':'#0d9488',border:'none',borderRadius:8,padding:'12px',color:loading?'#64748b':'white',fontSize:14,fontWeight:600,cursor:loading?'not-allowed':'pointer',marginTop:8}}>
            {loading ? 'Signing in...' : 'Sign In ?'}
          </button>
        </form>
        <div style={{marginTop:16,padding:12,background:'rgba(14,165,160,0.05)',border:'1px solid rgba(14,165,160,0.15)',borderRadius:8}}>
          <div style={{color:'#64748b',fontSize:11}}>Default credentials</div>
          <div style={{color:'#475569',fontSize:11,fontFamily:'monospace',marginTop:2}}>admin@hindleconsultants.com.au</div>
          <div style={{color:'#475569',fontSize:11,fontFamily:'monospace'}}>CashFlow2024!</div>
        </div>
      </div>
    </div>
  )
}
