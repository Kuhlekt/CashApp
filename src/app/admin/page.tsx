'use client'
import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Org { id: string; name: string; slug: string; plan: string; status: string; mrr: number; trialEndsAt: string | null; createdAt: string; maxUsers: number; maxBatches: number; stripeCustomerId: string | null; stripeSubId: string | null; _count?: { users: number; sessions: number; accounts: number } }
interface User { id: string; email: string; name: string; role: string; status: string; lastLoginAt: string | null; createdAt: string; failedLogins: number; org?: { name: string } }
interface AuditEntry { id: string; category: string; event: string; message: string; actor: string; timestamp: string; org?: { name: string } }
interface Stats { orgs: number; users: number; batches: number; allocations: number; activeOrgs: number; trialOrgs: number; mrr: number }
interface PromoCode { id: string; code: string; discountType: string; discountValue: number; currency: string | null; maxRedemptions: number | null; redemptions: number; validUntil: string | null; active: boolean; planCodes: string[] }

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#060A14', surface: '#0D1526', surface2: '#172035', border: '#324D72',
  text1: '#F8FAFF', text2: '#C4D3E8', text3: '#8899B8',
  teal: '#0EA5A0', tealL: '#2DD4BF', tealDim: 'rgba(14,165,160,0.15)',
  green: '#4ADE80', red: '#F87171', amber: '#F59E0B', purple: '#A78BFA',
}
const planColor: Record<string, string> = { trial: C.amber, starter: '#60A5FA', professional: C.purple, enterprise: C.green }
const statusColor: Record<string, string> = { trial: C.amber, active: C.green, suspended: C.red, cancelled: C.text3 }

const s = {
  page: { minHeight: '100vh', background: C.bg, color: C.text2, fontFamily: 'system-ui,sans-serif', display: 'flex' } as React.CSSProperties,
  sidebar: { width: 220, background: C.surface, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 } as React.CSSProperties,
  main: { flex: 1, padding: 28, overflow: 'auto' } as React.CSSProperties,
  card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 16 } as React.CSSProperties,
  cardHeader: { padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)' } as React.CSSProperties,
  cardBody: { padding: 18 } as React.CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: C.text3, borderBottom: `1px solid ${C.border}`, fontWeight: 700 },
  td: { padding: '10px 12px', borderBottom: `1px solid rgba(50,77,114,0.3)`, fontSize: 13, verticalAlign: 'middle' as const },
  inp: { background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text1, fontSize: 13, outline: 'none', fontFamily: 'inherit' } as React.CSSProperties,
  sel: { background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', color: C.text1, fontSize: 13, cursor: 'pointer', outline: 'none' } as React.CSSProperties,
  btn: (bg: string, border?: string) => ({ background: bg, border: `1px solid ${border ?? bg}`, borderRadius: 7, padding: '6px 14px', color: bg === 'transparent' ? C.text2 : 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }),
  badge: (color: string) => ({ background: `${color}20`, border: `1px solid ${color}40`, borderRadius: 12, padding: '2px 9px', fontSize: 11, color, fontWeight: 700 }),
  kpi: { background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px' } as React.CSSProperties,
  navItem: (active: boolean) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', cursor: 'pointer', fontSize: 13, color: active ? C.tealL : C.text2, background: active ? C.tealDim : 'transparent', borderLeft: active ? `2px solid ${C.teal}` : '2px solid transparent', transition: 'all 0.14s' } as React.CSSProperties),
}

export default function AdminPage() {
  const [view, setView]       = useState('overview')
  const [stats, setStats]     = useState<Stats | null>(null)
  const [orgs, setOrgs]       = useState<Org[]>([])
  const [users, setUsers]     = useState<User[]>([])
  const [audit, setAudit]     = useState<AuditEntry[]>([])
  const [promos, setPromos]   = useState<PromoCode[]>([])
  const [plans, setPlans]     = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [editing, setEditing] = useState<any>(null)
  const [modal, setModal]     = useState<string | null>(null)
  const [search, setSearch]   = useState('')
  const [toast, setToast]     = useState<string | null>(null)

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500) }, [])

  const load = useCallback(async (v = view) => {
    setLoading(true); setError('')
    try {
      if (v === 'overview' || v === 'orgs') {
        const res = await fetch(`/api/admin?view=${v === 'overview' ? 'overview' : 'orgs'}`)
        if (res.status === 403) { setError('Superadmin access required'); setLoading(false); return }
        const d = await res.json()
        if (v === 'overview') { setStats(d.stats); setOrgs(d.recentOrgs ?? []) }
        else setOrgs(d.orgs ?? [])
      }
      if (v === 'users') {
        const res = await fetch('/api/admin?view=users')
        const d = await res.json()
        setUsers(d.users ?? [])
      }
      if (v === 'audit') {
        const res = await fetch('/api/admin?view=audit')
        const d = await res.json()
        setAudit(d.logs ?? [])
      }
      if (v === 'pricing') {
        const [pr, pl] = await Promise.all([fetch('/api/admin?view=promos'), fetch('/api/admin?view=plans')])
        const pd = await pr.json(); const pld = await pl.json()
        setPromos(pd.promos ?? []); setPlans(pld.plans ?? [])
      }
    } catch (err) { setError('Load failed: ' + (err as Error).message) }
    setLoading(false)
  }, [view])

  useEffect(() => { load(view) }, [view])

  async function saveOrg(orgId: string, data: Record<string, unknown>) {
    const res = await fetch('/api/admin', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, ...data }) })
    if (res.ok) { setEditing(null); load(view); showToast('✓ Org updated') }
    else showToast('✗ Update failed')
  }

  async function savePromo(data: Record<string, unknown>) {
    const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-promo', ...data }) })
    if (res.ok) { setModal(null); load('pricing'); showToast('✓ Promo saved') }
    else { const d = await res.json(); showToast('✗ ' + (d.error ?? 'Failed')) }
  }

  async function togglePromo(id: string, active: boolean) {
    const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle-promo', id, active }) })
    if (res.ok) { load('pricing'); showToast('✓ Updated') }
  }

  async function extendTrial(orgId: string, days: number) {
    const res = await fetch('/api/admin', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, extendTrial: days }) })
    if (res.ok) { load(view); showToast(`✓ Trial extended by ${days} days`) }
  }

  async function impersonateOrg(orgId: string) {
    showToast('Impersonation — coming soon')
  }

  async function sendTestEmail(orgId: string) {
    const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test-email', orgId }) })
    if (res.ok) showToast('✓ Test email sent')
    else showToast('✗ Email send failed')
  }

  const filtered = <T extends { name?: string; email?: string; code?: string }>(items: T[]) =>
    search ? items.filter(i => JSON.stringify(i).toLowerCase().includes(search.toLowerCase())) : items

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'
  const fmtDateTime = (d: string | null) => d ? new Date(d).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
  const trialDays = (t: string | null) => t ? Math.max(0, Math.ceil((new Date(t).getTime() - Date.now()) / 86400000)) : null

  const NAV = [
    { id: 'overview', icon: '⊞', label: 'Overview' },
    { id: 'orgs', icon: '🏢', label: 'Organisations' },
    { id: 'users', icon: '👤', label: 'Users' },
    { id: 'pricing', icon: '💳', label: 'Pricing & Promos' },
    { id: 'trials', icon: '⏱', label: 'Trial Monitor' },
    { id: 'audit', icon: '◈', label: 'Audit Log' },
    { id: 'notifications', icon: '✉', label: 'Notifications' },
    { id: 'monitoring', icon: '⚡', label: 'Monitoring' },
  ]

  if (error && error.includes('Superadmin')) return (
    <div style={{ ...s.page, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 32 }}>⚡</div>
      <div style={{ color: C.red, fontSize: 18, fontWeight: 600 }}>Superadmin access required</div>
      <a href="/app" style={{ color: C.tealL }}>← Back to app</a>
    </div>
  )

  return (
    <div style={s.page}>
      {/* Toast */}
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 20px', fontSize: 13, color: C.text1, zIndex: 999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>{toast}</div>}

      {/* Sidebar */}
      <nav style={s.sidebar}>
        <div style={{ padding: '18px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ color: C.red, fontSize: 18 }}>⚡</span>
            <span style={{ color: C.text1, fontWeight: 700, fontSize: 15 }}>Super Admin</span>
          </div>
          <div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>CashFlow AI Platform</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {NAV.map(n => (
            <div key={n.id} style={s.navItem(view === n.id)} onClick={() => setView(n.id)}>
              <span style={{ fontSize: 14 }}>{n.icon}</span>
              <span>{n.label}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}` }}>
          <a href="/app" style={{ color: C.text3, fontSize: 12, textDecoration: 'none' }}>← Back to app</a>
        </div>
      </nav>

      {/* Main */}
      <main style={s.main}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ color: C.text1, fontSize: 20, fontWeight: 700 }}>{NAV.find(n => n.id === view)?.label}</div>
            <div style={{ color: C.text3, fontSize: 12, marginTop: 2 }}>CashFlow AI · Superadmin Console</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {['orgs', 'users', 'audit', 'pricing'].includes(view) && (
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ ...s.inp, width: 200 }} />
            )}
            <button style={s.btn(C.teal)} onClick={() => load(view)}>↻ Refresh</button>
          </div>
        </div>

        {loading && <div style={{ color: C.text3, fontSize: 13, marginBottom: 16 }}>Loading...</div>}

        {/* ── OVERVIEW ───────────────────────────────────────────────── */}
        {view === 'overview' && stats && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { l: 'Total Orgs', v: stats.orgs, c: C.text1 },
                { l: 'Active', v: stats.activeOrgs, c: C.green },
                { l: 'Trial', v: stats.trialOrgs, c: C.amber },
                { l: 'Users', v: stats.users, c: C.text2 },
                { l: 'Sessions', v: stats.batches, c: C.text2 },
                { l: 'Allocations', v: stats.allocations, c: C.text2 },
                { l: 'MRR', v: `$${(stats.mrr ?? 0).toLocaleString()}`, c: C.tealL },
              ].map(k => (
                <div key={k.l} style={s.kpi}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.text3, marginBottom: 6 }}>{k.l}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: k.c, fontFamily: 'monospace' }}>{k.v}</div>
                </div>
              ))}
            </div>
            <div style={s.card}>
              <div style={s.cardHeader}><span style={{ color: C.text1, fontWeight: 600, fontSize: 13 }}>Recent Organisations</span></div>
              <OrgTable orgs={orgs.slice(0, 8)} s={s} C={C} planColor={planColor} statusColor={statusColor} fmtDate={fmtDate} trialDays={trialDays} onEdit={setEditing} onExtend={extendTrial} onEmail={sendTestEmail} />
            </div>
          </>
        )}

        {/* ── ORGS ───────────────────────────────────────────────────── */}
        {view === 'orgs' && (
          <div style={s.card}>
            <div style={s.cardHeader}>
              <span style={{ color: C.text1, fontWeight: 600, fontSize: 13 }}>All Organisations ({filtered(orgs).length})</span>
            </div>
            <OrgTable orgs={filtered(orgs)} s={s} C={C} planColor={planColor} statusColor={statusColor} fmtDate={fmtDate} trialDays={trialDays} onEdit={setEditing} onExtend={extendTrial} onEmail={sendTestEmail} />
          </div>
        )}

        {/* ── USERS ──────────────────────────────────────────────────── */}
        {view === 'users' && (
          <div style={s.card}>
            <div style={s.cardHeader}><span style={{ color: C.text1, fontWeight: 600, fontSize: 13 }}>All Users ({filtered(users).length})</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Name', 'Email', 'Org', 'Role', 'Status', 'Last Login', 'Failed Logins', 'Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered(users).map(u => (
                  <tr key={u.id}>
                    <td style={{ ...s.td, color: C.text1, fontWeight: 500 }}>{u.name}</td>
                    <td style={{ ...s.td, fontSize: 12, fontFamily: 'monospace', color: C.text3 }}>{u.email}</td>
                    <td style={{ ...s.td, fontSize: 12 }}>{u.org?.name ?? '—'}</td>
                    <td style={s.td}><span style={s.badge(u.role === 'superadmin' ? C.red : u.role === 'admin' ? C.purple : C.teal)}>{u.role}</span></td>
                    <td style={s.td}><span style={s.badge(u.status === 'active' ? C.green : C.red)}>{u.status}</span></td>
                    <td style={{ ...s.td, fontSize: 11, color: C.text3 }}>{fmtDateTime(u.lastLoginAt)}</td>
                    <td style={{ ...s.td, textAlign: 'center', color: u.failedLogins > 0 ? C.amber : C.text3 }}>{u.failedLogins}</td>
                    <td style={s.td}>
                      <button style={s.btn(C.surface2, C.border)} onClick={() => { /* suspend user */ }}>Suspend</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── TRIAL MONITOR ──────────────────────────────────────────── */}
        {view === 'trials' && (
          <TrialMonitor orgs={orgs.length ? orgs : []} s={s} C={C} planColor={planColor} statusColor={statusColor} fmtDate={fmtDate} trialDays={trialDays} onExtend={extendTrial} onLoad={() => load('orgs')} />
        )}

        {/* ── PRICING & PROMOS ───────────────────────────────────────── */}
        {view === 'pricing' && (
          <PricingAdmin s={s} C={C} plans={plans} promos={filtered(promos)} onSavePromo={savePromo} onTogglePromo={togglePromo} onNewPromo={() => setModal('new-promo')} modal={modal} setModal={setModal} showToast={showToast} />
        )}

        {/* ── AUDIT LOG ──────────────────────────────────────────────── */}
        {view === 'audit' && (
          <div style={s.card}>
            <div style={s.cardHeader}><span style={{ color: C.text1, fontWeight: 600, fontSize: 13 }}>Audit Log ({filtered(audit).length} events)</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Time', 'Org', 'Category', 'Event', 'Message', 'Actor'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered(audit).map(e => (
                  <tr key={e.id}>
                    <td style={{ ...s.td, fontSize: 11, color: C.text3, whiteSpace: 'nowrap' }}>{fmtDateTime(e.timestamp)}</td>
                    <td style={{ ...s.td, fontSize: 11 }}>{e.org?.name ?? '—'}</td>
                    <td style={s.td}><span style={s.badge(e.category === 'security' ? C.red : e.category === 'approve' ? C.green : C.teal)}>{e.category}</span></td>
                    <td style={{ ...s.td, fontSize: 11, fontFamily: 'monospace', color: C.tealL }}>{e.event}</td>
                    <td style={{ ...s.td, fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.message}</td>
                    <td style={{ ...s.td, fontSize: 11, color: C.text3 }}>{e.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── NOTIFICATIONS ──────────────────────────────────────────── */}
        {view === 'notifications' && <NotificationsAdmin s={s} C={C} showToast={showToast} />}

        {/* ── MONITORING ─────────────────────────────────────────────── */}
        {view === 'monitoring' && <MonitoringAdmin s={s} C={C} />}

      </main>

      {/* Edit Org Modal */}
      {editing && (
        <Modal title={`Edit — ${editing.name}`} onClose={() => setEditing(null)} C={C}>
          <EditOrgForm org={editing} s={s} C={C} planColor={planColor} onSave={saveOrg} onClose={() => setEditing(null)} onExtend={extendTrial} />
        </Modal>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, C }: { title: string; onClose: () => void; children: React.ReactNode; C: typeof C }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: 480, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ color: C.text1, fontWeight: 700, fontSize: 15 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

function OrgTable({ orgs, s, C, planColor, statusColor, fmtDate, trialDays, onEdit, onExtend, onEmail }: any) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>{['Org', 'Plan', 'Status', 'Users', 'Sessions', 'MRR', 'Trial/Created', 'Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {orgs.map((org: any) => {
          const td = trialDays(org.trialEndsAt)
          return (
            <tr key={org.id}>
              <td style={{ ...s.td, color: C.text1, fontWeight: 500 }}>
                <div>{org.name}</div>
                <div style={{ fontSize: 10, color: C.text3, fontFamily: 'monospace' }}>{org.slug}</div>
              </td>
              <td style={s.td}><span style={{ background: `${planColor[org.plan] ?? C.text3}20`, border: `1px solid ${planColor[org.plan] ?? C.text3}40`, borderRadius: 12, padding: '2px 9px', fontSize: 11, color: planColor[org.plan] ?? C.text3, fontWeight: 700 }}>{org.plan}</span></td>
              <td style={s.td}><span style={{ background: `${statusColor[org.status] ?? C.text3}20`, border: `1px solid ${statusColor[org.status] ?? C.text3}40`, borderRadius: 12, padding: '2px 9px', fontSize: 11, color: statusColor[org.status] ?? C.text3, fontWeight: 700 }}>{org.status}</span></td>
              <td style={{ ...s.td, textAlign: 'center' }}>{org._count?.users ?? org.maxUsers}</td>
              <td style={{ ...s.td, textAlign: 'center' }}>{org._count?.sessions ?? 0}</td>
              <td style={{ ...s.td, fontFamily: 'monospace', color: C.tealL }}>${org.mrr ?? 0}</td>
              <td style={{ ...s.td, fontSize: 11 }}>
                {org.status === 'trial' && td !== null
                  ? <span style={{ color: td <= 3 ? C.red : td <= 7 ? C.amber : C.green, fontWeight: 600 }}>{td}d left</span>
                  : fmtDate(org.createdAt)}
              </td>
              <td style={s.td}>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button style={s.btn(C.surface2, C.border)} onClick={() => onEdit(org)}>Edit</button>
                  {org.status === 'trial' && <button style={s.btn(C.surface2, C.border)} onClick={() => onExtend(org.id, 7)}>+7d</button>}
                  <button style={s.btn(C.surface2, C.border)} onClick={() => onEmail(org.id)}>✉</button>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function EditOrgForm({ org, s, C, planColor, onSave, onClose, onExtend }: any) {
  const [form, setForm] = useState({ plan: org.plan, status: org.status, mrr: org.mrr ?? 0, maxUsers: org.maxUsers, maxBatches: org.maxBatches })
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ color: C.text3, fontSize: 12, marginBottom: 6 }}>Plan</div>
          <select style={{ ...s.sel, width: '100%' }} value={form.plan} onChange={e => set('plan', e.target.value)}>
            {['trial', 'starter', 'professional', 'enterprise'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <div style={{ color: C.text3, fontSize: 12, marginBottom: 6 }}>Status</div>
          <select style={{ ...s.sel, width: '100%' }} value={form.status} onChange={e => set('status', e.target.value)}>
            {['trial', 'active', 'suspended', 'cancelled'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <div style={{ color: C.text3, fontSize: 12, marginBottom: 6 }}>MRR ($)</div>
          <input style={{ ...s.inp, width: '100%', boxSizing: 'border-box' }} type="number" value={form.mrr} onChange={e => set('mrr', parseInt(e.target.value) || 0)} />
        </div>
        <div>
          <div style={{ color: C.text3, fontSize: 12, marginBottom: 6 }}>Max Users</div>
          <input style={{ ...s.inp, width: '100%', boxSizing: 'border-box' }} type="number" value={form.maxUsers} onChange={e => set('maxUsers', parseInt(e.target.value) || 3)} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <div style={{ color: C.text3, fontSize: 12, marginBottom: 6 }}>Max Batch Sessions/Month</div>
          <input style={{ ...s.inp, width: '100%', boxSizing: 'border-box' }} type="number" value={form.maxBatches} onChange={e => set('maxBatches', parseInt(e.target.value) || 20)} />
        </div>
      </div>
      {org.status === 'trial' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ color: C.text3, fontSize: 12, alignSelf: 'center' }}>Extend trial:</span>
          {[7, 14, 30].map(d => <button key={d} style={s.btn(C.surface2, C.border)} onClick={() => onExtend(org.id, d)}>+{d} days</button>)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
        <button style={s.btn('transparent', C.border)} onClick={onClose}>Cancel</button>
        <button style={s.btn(C.teal)} onClick={() => onSave(org.id, form)}>Save changes</button>
      </div>
    </div>
  )
}

function TrialMonitor({ orgs, s, C, planColor, statusColor, fmtDate, trialDays, onExtend, onLoad }: any) {
  const [loaded, setLoaded] = useState(false)
  const [trialOrgs, setTrialOrgs] = useState<any[]>([])

  useEffect(() => {
    fetch('/api/admin?view=orgs').then(r => r.json()).then(d => {
      setTrialOrgs((d.orgs ?? []).filter((o: any) => o.status === 'trial' || o.trialEndsAt))
      setLoaded(true)
    })
  }, [])

  const urgency = (td: number | null) => td === null ? 'none' : td <= 1 ? 'critical' : td <= 3 ? 'warning' : td <= 7 ? 'watch' : 'ok'
  const urgencyColor = { critical: C.red, warning: C.amber, watch: '#60A5FA', ok: C.green, none: C.text3 }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { l: 'On Trial', v: trialOrgs.length, c: C.amber },
          { l: 'Expiring ≤3 days', v: trialOrgs.filter(o => { const d = trialDays(o.trialEndsAt); return d !== null && d <= 3 }).length, c: C.red },
          { l: 'Expiring ≤7 days', v: trialOrgs.filter(o => { const d = trialDays(o.trialEndsAt); return d !== null && d <= 7 }).length, c: C.amber },
          { l: 'Expired (pending)', v: trialOrgs.filter(o => { const d = trialDays(o.trialEndsAt); return d !== null && d <= 0 }).length, c: C.red },
        ].map(k => (
          <div key={k.l} style={s.kpi}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.text3, marginBottom: 6 }}>{k.l}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div style={s.card}>
        <div style={s.cardHeader}><span style={{ color: C.text1, fontWeight: 600, fontSize: 13 }}>Active Trials</span></div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Org', 'Plan', 'Trial Ends', 'Days Left', 'Users', 'Sessions', 'Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {trialOrgs.sort((a: any, b: any) => (trialDays(a.trialEndsAt) ?? 999) - (trialDays(b.trialEndsAt) ?? 999)).map((org: any) => {
              const td = trialDays(org.trialEndsAt)
              const urg = urgency(td)
              return (
                <tr key={org.id}>
                  <td style={{ ...s.td, color: C.text1, fontWeight: 500 }}>{org.name}</td>
                  <td style={s.td}><span style={{ ...s.badge(planColor[org.plan] ?? C.text3) }}>{org.plan}</span></td>
                  <td style={{ ...s.td, fontSize: 11, color: C.text3 }}>{fmtDate(org.trialEndsAt)}</td>
                  <td style={s.td}>
                    <span style={{ color: urgencyColor[urg], fontWeight: 700, fontSize: 14 }}>
                      {td !== null ? (td <= 0 ? 'EXPIRED' : `${td}d`) : '—'}
                    </span>
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>{org._count?.users ?? 0}</td>
                  <td style={{ ...s.td, textAlign: 'center' }}>{org._count?.sessions ?? 0}</td>
                  <td style={s.td}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button style={s.btn(C.surface2, C.border)} onClick={() => onExtend(org.id, 7)}>+7d</button>
                      <button style={s.btn(C.surface2, C.border)} onClick={() => onExtend(org.id, 30)}>+30d</button>
                      <button style={s.btn(C.teal)} onClick={() => window.location.href = `/api/billing?orgId=${org.id}`}>Upgrade</button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {trialOrgs.length === 0 && <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color: C.text3, padding: 32 }}>No active trials</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PricingAdmin({ s, C, plans, promos, onSavePromo, onTogglePromo, onNewPromo, modal, setModal, showToast }: any) {
  const [newPromo, setNewPromo] = useState({ code: '', discountType: 'percent', discountValue: 20, maxRedemptions: 100, validUntil: '', planCodes: [] as string[], active: true })
  const [pricingTab, setPricingTab] = useState('promos')

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {['promos', 'plans'].map(t => (
          <button key={t} onClick={() => setPricingTab(t)} style={{ background: pricingTab === t ? C.teal : 'transparent', border: 'none', borderRadius: 7, padding: '7px 18px', color: pricingTab === t ? 'white' : C.text3, fontSize: 13, fontWeight: pricingTab === t ? 700 : 400, cursor: 'pointer' }}>
            {t === 'promos' ? '🎟 Promo Codes' : '💳 Plans'}
          </button>
        ))}
      </div>

      {/* Promo Codes */}
      {pricingTab === 'promos' && (
        <div style={s.card}>
          <div style={s.cardHeader}>
            <span style={{ color: C.text1, fontWeight: 600, fontSize: 13 }}>Promo Codes ({promos.length})</span>
            <button style={s.btn(C.teal)} onClick={onNewPromo}>+ New Promo</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Code', 'Discount', 'Redemptions', 'Valid Until', 'Plans', 'Status', 'Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {promos.map((p: PromoCode) => (
                <tr key={p.id}>
                  <td style={{ ...s.td, fontFamily: 'monospace', color: C.tealL, fontWeight: 700 }}>{p.code}</td>
                  <td style={{ ...s.td, color: C.green }}>{p.discountType === 'percent' ? `${p.discountValue}%` : `$${p.discountValue / 100}`} off</td>
                  <td style={s.td}>{p.redemptions}{p.maxRedemptions ? ` / ${p.maxRedemptions}` : ' / ∞'}</td>
                  <td style={{ ...s.td, fontSize: 11, color: C.text3 }}>{p.validUntil ? new Date(p.validUntil).toLocaleDateString('en-AU') : 'No expiry'}</td>
                  <td style={{ ...s.td, fontSize: 11 }}>{p.planCodes.length ? p.planCodes.join(', ') : 'All plans'}</td>
                  <td style={s.td}><span style={{ background: p.active ? `${C.green}20` : `${C.red}20`, border: `1px solid ${p.active ? C.green : C.red}40`, borderRadius: 12, padding: '2px 9px', fontSize: 11, color: p.active ? C.green : C.red, fontWeight: 700 }}>{p.active ? 'Active' : 'Inactive'}</span></td>
                  <td style={s.td}>
                    <button style={s.btn(C.surface2, C.border)} onClick={() => onTogglePromo(p.id, !p.active)}>{p.active ? 'Disable' : 'Enable'}</button>
                  </td>
                </tr>
              ))}
              {promos.length === 0 && <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color: C.text3, padding: 32 }}>No promo codes. Create one above.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Plans */}
      {pricingTab === 'plans' && (
        <div style={s.card}>
          <div style={s.cardHeader}>
            <span style={{ color: C.text1, fontWeight: 600, fontSize: 13 }}>Plans ({plans.length > 0 ? plans.length : 'static fallback'})</span>
            <button style={s.btn(C.teal)} onClick={async () => {
              const res = await fetch('/api/pricing', { method: 'POST' })
              const d = await res.json()
              showToast(d.ok ? `✓ Synced ${d.synced} prices to Stripe` : '✗ ' + (d.error ?? 'Sync failed'))
            }}>⇅ Sync to Stripe</button>
          </div>
          <div style={s.cardBody}>
            {plans.length === 0 ? (
              <div style={{ color: C.text3, fontSize: 13 }}>
                <p>No plans in database. Run <code style={{ background: C.surface2, padding: '2px 6px', borderRadius: 4 }}>npm run db:seed-pricing</code> to seed plans.</p>
                <p style={{ marginTop: 8 }}>Plans are seeded with prices for AUD, USD, NZD, GBP, EUR in monthly and annual intervals.</p>
                <p style={{ marginTop: 8 }}>After seeding, click <strong>Sync to Stripe</strong> to create products and prices in your Stripe account.</p>
              </div>
            ) : plans.map((plan: any) => (
              <div key={plan.code} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ color: C.text1, fontWeight: 700, fontSize: 15 }}>{plan.name}</div>
                    <div style={{ color: C.text3, fontSize: 12 }}>{plan.description}</div>
                  </div>
                  <div style={{ fontSize: 12, color: C.text3 }}>{plan.maxUsers} users · {plan.maxBatches > 10000 ? '∞' : plan.maxBatches} sessions</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {plan.prices?.map((price: any) => (
                    <div key={price.id} style={{ background: C.surface, border: `1px solid ${price.stripePriceId ? C.teal : C.border}`, borderRadius: 7, padding: '6px 12px', fontSize: 12 }}>
                      <span style={{ color: price.stripePriceId ? C.tealL : C.text3 }}>{price.currency} {price.interval}</span>
                      <span style={{ color: C.text1, fontWeight: 700, marginLeft: 6 }}>${Math.round(price.amount / 100)}</span>
                      {price.stripePriceId && <span style={{ color: C.green, fontSize: 10, marginLeft: 4 }}>✓</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Promo Modal */}
      {modal === 'new-promo' && (
        <Modal title="New Promo Code" onClose={() => setModal(null)} C={C}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Code (uppercase)', key: 'code', type: 'text', placeholder: 'LAUNCH50' },
              { label: 'Discount %', key: 'discountValue', type: 'number', placeholder: '20' },
              { label: 'Max uses (blank = unlimited)', key: 'maxRedemptions', type: 'number', placeholder: '100' },
              { label: 'Expires (blank = no expiry)', key: 'validUntil', type: 'date', placeholder: '' },
            ].map(f => (
              <div key={f.key}>
                <div style={{ color: C.text3, fontSize: 12, marginBottom: 6 }}>{f.label}</div>
                <input type={f.type} placeholder={f.placeholder} value={(newPromo as any)[f.key] ?? ''} onChange={e => setNewPromo(p => ({ ...p, [f.key]: f.type === 'number' ? (parseInt(e.target.value) || 0) : e.target.value.toUpperCase() }))}
                  style={{ ...s.inp, width: '100%', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div>
              <div style={{ color: C.text3, fontSize: 12, marginBottom: 6 }}>Apply to plans (blank = all)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['starter', 'professional', 'enterprise'].map(p => (
                  <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13, color: C.text2 }}>
                    <input type="checkbox" checked={newPromo.planCodes.includes(p)} onChange={e => setNewPromo(np => ({ ...np, planCodes: e.target.checked ? [...np.planCodes, p] : np.planCodes.filter(x => x !== p) }))} style={{ accentColor: C.teal }} />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <button style={s.btn('transparent', C.border)} onClick={() => setModal(null)}>Cancel</button>
              <button style={s.btn(C.teal)} onClick={() => onSavePromo({ ...newPromo, discountType: 'percent', validUntil: newPromo.validUntil || null, maxRedemptions: newPromo.maxRedemptions || null })}>Create Promo</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function NotificationsAdmin({ s, C, showToast }: any) {
  const [cfg, setCfg] = useState({ clicksendUsername: '', clicksendKey: '', fromName: 'CashFlow AI', fromEmail: '', emailAddressId: '', smsFrom: '' })
  const [status, setStatus] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  async function testEmail() {
    const res = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test-email' }) })
    const d = await res.json()
    showToast(d.ok ? '✓ Test email sent' : '✗ ' + (d.error ?? 'Failed'))
  }

  async function testSMS() {
    const res = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test-sms' }) })
    const d = await res.json()
    showToast(d.ok ? '✓ Test SMS sent' : '✗ ' + (d.error ?? 'Failed'))
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={s.card}>
          <div style={s.cardHeader}><span style={{ color: C.text1, fontWeight: 600, fontSize: 13 }}>✉ ClickSend Configuration</span></div>
          <div style={s.cardBody}>
            <p style={{ color: C.text3, fontSize: 12, marginBottom: 16 }}>Platform-wide ClickSend credentials for transactional emails and SMS. Get credentials from <a href="https://www.clicksend.com/au/account" target="_blank" rel="noopener" style={{ color: C.tealL }}>clicksend.com</a></p>
            {[
              { label: 'Username (email)', key: 'clicksendUsername', type: 'email' },
              { label: 'API Key', key: 'clicksendKey', type: 'password' },
              { label: 'From Name', key: 'fromName', type: 'text' },
              { label: 'From Email', key: 'fromEmail', type: 'email' },
              { label: 'Email Address ID', key: 'emailAddressId', type: 'text' },
              { label: 'SMS From (max 11 chars)', key: 'smsFrom', type: 'text' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <div style={{ color: C.text3, fontSize: 12, marginBottom: 5 }}>{f.label}</div>
                <input type={f.type} value={(cfg as any)[f.key]} onChange={e => setCfg(c => ({ ...c, [f.key]: e.target.value }))} style={{ ...s.inp, width: '100%', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button style={s.btn(C.teal)} onClick={() => showToast('Save via env vars in Vercel dashboard')}>Save Config</button>
              <button style={s.btn(C.surface2, C.border)} onClick={testEmail}>Test Email</button>
              <button style={s.btn(C.surface2, C.border)} onClick={testSMS}>Test SMS</button>
            </div>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardHeader}><span style={{ color: C.text1, fontWeight: 600, fontSize: 13 }}>📋 Notification Events</span></div>
          <div style={s.cardBody}>
            <p style={{ color: C.text3, fontSize: 12, marginBottom: 16 }}>Platform-wide notification triggers. All events are sent to org admins.</p>
            {[
              { icon: '✓', event: 'Batch complete', desc: 'Sent when automation run finishes', active: true },
              { icon: '⚠', event: 'Exception alert', desc: 'Exceptions requiring urgent review', active: true },
              { icon: '✦', event: 'Approval required', desc: 'High-value item needs sign-off', active: true },
              { icon: '⬢', event: 'ERP export ready', desc: 'Output file ready for posting', active: true },
              { icon: '⏱', event: 'Trial expiry', desc: 'Warning at 7, 3, 1 days before', active: true },
              { icon: '💳', event: 'Payment failed', desc: 'Stripe payment failure', active: true },
            ].map(n => (
              <div key={n.event} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid rgba(50,77,114,0.3)` }}>
                <span style={{ fontSize: 16, width: 24 }}>{n.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.text1, fontSize: 13, fontWeight: 500 }}>{n.event}</div>
                  <div style={{ color: C.text3, fontSize: 11 }}>{n.desc}</div>
                </div>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.active ? C.green : C.text3 }}></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MonitoringAdmin({ s, C }: any) {
  const [health, setHealth] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(d => { setHealth(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const statusIcon = (ok: boolean) => ok ? '✓' : '✗'
  const statusColor = (ok: boolean) => ok ? C.green : C.red

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={s.card}>
          <div style={s.cardHeader}><span style={{ color: C.text1, fontWeight: 600, fontSize: 13 }}>⚡ Platform Health</span></div>
          <div style={s.cardBody}>
            {loading ? <div style={{ color: C.text3 }}>Checking...</div> : health ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: health.status === 'healthy' ? `${C.green}20` : `${C.amber}20`, border: `2px solid ${health.status === 'healthy' ? C.green : C.amber}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    {health.status === 'healthy' ? '✓' : '⚠'}
                  </div>
                  <div>
                    <div style={{ color: health.status === 'healthy' ? C.green : C.amber, fontWeight: 700, fontSize: 16, textTransform: 'uppercase' }}>{health.status}</div>
                    <div style={{ color: C.text3, fontSize: 12 }}>{health.totalMs}ms · {health.env} · {health.region}</div>
                  </div>
                </div>
                {Object.entries(health.checks ?? {}).map(([key, val]: [string, any]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid rgba(50,77,114,0.3)` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: statusColor(val.ok), fontSize: 14 }}>{statusIcon(val.ok)}</span>
                      <span style={{ color: C.text1, fontSize: 14, textTransform: 'capitalize' }}>{key}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {val.ms && <span style={{ color: C.text3, fontSize: 11 }}>{val.ms}ms</span>}
                      {val.error && <span style={{ color: C.red, fontSize: 11 }}>{val.error.slice(0, 40)}</span>}
                    </div>
                  </div>
                ))}
                <button style={{ ...s.btn(C.surface2, C.border), marginTop: 16 }} onClick={() => { setLoading(true); fetch('/api/health').then(r => r.json()).then(d => { setHealth(d); setLoading(false) }) }}>↻ Refresh</button>
              </>
            ) : <div style={{ color: C.red }}>Health check failed</div>}
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardHeader}><span style={{ color: C.text1, fontWeight: 600, fontSize: 13 }}>📊 System Info</span></div>
          <div style={s.cardBody}>
            {[
              { l: 'Version', v: '1.0.0' },
              { l: 'Next.js', v: '15.x' },
              { l: 'Database', v: 'Neon PostgreSQL' },
              { l: 'Auth', v: 'NextAuth v5 · JWT' },
              { l: 'AI Engine', v: 'claude-sonnet-4-20250514' },
              { l: 'Email/SMS', v: 'ClickSend' },
              { l: 'Billing', v: 'Stripe' },
              { l: 'Hosting', v: 'Vercel syd1' },
              { l: 'Cron', v: 'Vercel · 15min + daily' },
            ].map(i => (
              <div key={i.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid rgba(50,77,114,0.3)` }}>
                <span style={{ color: C.text3, fontSize: 13 }}>{i.l}</span>
                <span style={{ color: C.text1, fontSize: 13, fontWeight: 500 }}>{i.v}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...s.card, gridColumn: '1/-1' }}>
          <div style={s.cardHeader}><span style={{ color: C.text1, fontWeight: 600, fontSize: 13 }}>🔧 Admin Actions</span></div>
          <div style={{ ...s.cardBody, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {[
              { label: 'Run Trial Expiry Check', desc: 'Check and warn expiring trials', action: () => fetch('/api/cron/trial-expiry', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }) },
              { label: 'Sync Stripe Prices', desc: 'Create Stripe products from DB plans', action: () => fetch('/api/pricing', { method: 'POST' }) },
              { label: 'Export All Audit Logs', desc: 'Download complete platform audit log', action: () => window.open('/api/export?type=audit') },
            ].map(action => (
              <div key={action.label} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
                <div style={{ color: C.text1, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{action.label}</div>
                <div style={{ color: C.text3, fontSize: 12, marginBottom: 12 }}>{action.desc}</div>
                <button style={s.btn(C.surface, C.border)} onClick={() => action.action().then(() => alert('Done'))}>Run</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
