'use client'
import { useState, useEffect } from 'react'

interface OrgRow { id: string; name: string; slug: string; plan: string; status: string; mrr: number; createdAt: string; trialEndsAt: string | null; _count: { users: number } }
interface Stats { orgs: number; users: number; batches: number; allocations: number; activeOrgs: number; trialOrgs: number; mrr: number }

const PLANS = ['trial', 'starter', 'professional', 'enterprise']
const STATUS = ['trial', 'active', 'suspended', 'cancelled']
const planColor: Record<string, string> = { trial: '#f59e0b', starter: '#3b82f6', professional: '#8b5cf6', enterprise: '#10b981' }
const statusColor: Record<string, string> = { trial: '#f59e0b', active: '#4ade80', suspended: '#f87171', cancelled: '#64748b' }

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [view, setView] = useState<'overview' | 'orgs'>('overview')
  const [editing, setEditing] = useState<OrgRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [view])

  async function load() {
    const res = await fetch(`/api/admin?view=${view === 'orgs' ? 'orgs' : 'overview'}`)
    if (!res.ok) { setError('Access denied — superadmin only'); return }
    const data = await res.json()
    if (view === 'overview') { setStats(data.stats); setOrgs(data.recentOrgs) }
    else { setOrgs(data.orgs) }
  }

  async function saveOrg() {
    if (!editing) return
    setSaving(true)
    const res = await fetch('/api/admin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: editing.id, plan: editing.plan, status: editing.status, mrr: editing.mrr }),
    })
    if (res.ok) { setEditing(null); load() }
    setSaving(false)
  }

  const s = {
    page: { minHeight: '100vh', background: '#060A14', color: '#C4D3E8', fontFamily: 'system-ui, sans-serif', padding: 32 } as React.CSSProperties,
    card: { background: '#0D1526', border: '1px solid #324D72', borderRadius: 12, padding: 20, marginBottom: 16 } as React.CSSProperties,
    kpi: { background: '#0D1526', border: '1px solid #324D72', borderRadius: 10, padding: '14px 18px' } as React.CSSProperties,
    th: { textAlign: 'left' as const, padding: '8px 12px', fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#8899B8', borderBottom: '1px solid #324D72' },
    td: { padding: '10px 12px', borderBottom: '1px solid rgba(50,77,114,0.4)', fontSize: 13 },
    btn: (color: string) => ({ background: color, border: 'none', borderRadius: 7, padding: '6px 14px', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties),
    inp: { background: '#172035', border: '1px solid #324D72', borderRadius: 7, padding: '7px 10px', color: '#F0F6FF', fontSize: 13, outline: 'none' } as React.CSSProperties,
    sel: { background: '#172035', border: '1px solid #324D72', borderRadius: 7, padding: '7px 10px', color: '#F0F6FF', fontSize: 13, outline: 'none', cursor: 'pointer' } as React.CSSProperties,
  }

  if (error) return <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: '#f87171', fontSize: 18 }}>⚠ {error}</div></div>

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#f87171', fontSize: 20 }}>⚡</span>
            <span style={{ color: '#F8FAFF', fontSize: 20, fontWeight: 700 }}>Super Admin</span>
            <span style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 20, padding: '2px 10px', fontSize: 10, color: '#f87171', fontWeight: 700 }}>RESTRICTED</span>
          </div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>CashFlow AI Platform Management</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn(view === 'overview' ? '#0EA5A0' : '#172035')} onClick={() => setView('overview')}>Overview</button>
          <button style={s.btn(view === 'orgs' ? '#0EA5A0' : '#172035')} onClick={() => setView('orgs')}>All Orgs</button>
          <a href="/cashflow-app.html" style={{ ...s.btn('#172035'), textDecoration: 'none', display: 'inline-block' }}>← App</a>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total Orgs', value: stats.orgs, color: '#F8FAFF' },
            { label: 'Active', value: stats.activeOrgs, color: '#4ade80' },
            { label: 'Trial', value: stats.trialOrgs, color: '#f59e0b' },
            { label: 'Total Users', value: stats.users, color: '#C4D3E8' },
            { label: 'Batch Sessions', value: stats.batches, color: '#C4D3E8' },
            { label: 'Allocations', value: stats.allocations, color: '#C4D3E8' },
            { label: 'MRR', value: `$${stats.mrr.toLocaleString()}`, color: '#2DD4BF' },
          ].map(k => (
            <div key={k.label} style={s.kpi}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8899B8', marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Orgs table */}
      <div style={s.card}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#C4D3E8', marginBottom: 14 }}>
          {view === 'overview' ? 'Recent Organisations' : `All Organisations (${orgs.length})`}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Org Name', 'Slug', 'Plan', 'Status', 'Users', 'MRR', 'Trial Ends', 'Created', 'Actions'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orgs.map(org => (
              <tr key={org.id} style={{ cursor: 'pointer' }}>
                <td style={{ ...s.td, color: '#F0F6FF', fontWeight: 500 }}>{org.name}</td>
                <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 11, color: '#8899B8' }}>{org.slug}</td>
                <td style={s.td}>
                  <span style={{ background: `${planColor[org.plan] ?? '#64748b'}20`, border: `1px solid ${planColor[org.plan] ?? '#64748b'}40`, borderRadius: 12, padding: '2px 8px', fontSize: 11, color: planColor[org.plan] ?? '#64748b', fontWeight: 600 }}>
                    {org.plan}
                  </span>
                </td>
                <td style={s.td}>
                  <span style={{ background: `${statusColor[org.status] ?? '#64748b'}20`, border: `1px solid ${statusColor[org.status] ?? '#64748b'}40`, borderRadius: 12, padding: '2px 8px', fontSize: 11, color: statusColor[org.status] ?? '#64748b', fontWeight: 600 }}>
                    {org.status}
                  </span>
                </td>
                <td style={{ ...s.td, textAlign: 'center' as const }}>{org._count?.users ?? 0}</td>
                <td style={{ ...s.td, color: '#2DD4BF', fontFamily: 'monospace' }}>${org.mrr}</td>
                <td style={{ ...s.td, fontSize: 11, color: '#8899B8' }}>{org.trialEndsAt ? new Date(org.trialEndsAt).toLocaleDateString('en-AU') : '—'}</td>
                <td style={{ ...s.td, fontSize: 11, color: '#8899B8' }}>{new Date(org.createdAt).toLocaleDateString('en-AU')}</td>
                <td style={s.td}>
                  <button style={s.btn('#172035')} onClick={() => setEditing({ ...org })}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#0D1526', border: '1px solid #324D72', borderRadius: 14, padding: 28, width: 420 }}>
            <div style={{ color: '#F8FAFF', fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Edit — {editing.name}</div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <div style={{ color: '#8899B8', fontSize: 12, marginBottom: 6 }}>Plan</div>
                <select style={{ ...s.sel, width: '100%' }} value={editing.plan} onChange={e => setEditing({ ...editing, plan: e.target.value })}>
                  {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <div style={{ color: '#8899B8', fontSize: 12, marginBottom: 6 }}>Status</div>
                <select style={{ ...s.sel, width: '100%' }} value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}>
                  {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div style={{ color: '#8899B8', fontSize: 12, marginBottom: 6 }}>MRR ($)</div>
                <input style={{ ...s.inp, width: '100%', boxSizing: 'border-box' }} type="number" value={editing.mrr} onChange={e => setEditing({ ...editing, mrr: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button style={s.btn('#0EA5A0')} onClick={saveOrg} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              <button style={s.btn('#172035')} onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
