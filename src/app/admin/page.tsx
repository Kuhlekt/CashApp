'use client'
import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Org { id:string;name:string;slug:string;plan:string;status:string;mrr:number;trialEndsAt:string|null;createdAt:string;maxUsers:number;maxBatches:number;stripeCustomerId:string|null;_count?:{users:number;sessions:number} }
interface User { id:string;email:string;name:string;role:string;status:string;lastLoginAt:string|null;failedLogins:number;org?:{name:string} }
interface AuditEntry { id:string;category:string;event:string;message:string;actor:string;timestamp:string;org?:{name:string} }
interface PromoCode { id:string;code:string;discountType:string;discountValue:number;maxRedemptions:number|null;redemptions:number;validUntil:string|null;active:boolean;planCodes:string[] }
interface PlanPrice { id:string;currency:string;interval:string;amount:number;discountPct:number;stripePriceId:string|null }
interface Plan { id:string;code:string;name:string;description:string;maxUsers:number;maxBatches:number;baseUsdMonth:number;annualDiscountPct:number;features:string[];active:boolean;prices:PlanPrice[] }
interface Stats { orgs:number;users:number;batches:number;allocations:number;activeOrgs:number;trialOrgs:number;mrr:number }

// ── Design tokens ─────────────────────────────────────────────────────────────
const C={bg:'#060A14',sur:'#0D1526',sur2:'#172035',bdr:'#324D72',t1:'#F8FAFF',t2:'#C4D3E8',t3:'#8899B8',teal:'#0EA5A0',tealL:'#2DD4BF',green:'#4ADE80',red:'#F87171',amber:'#F59E0B',purple:'#A78BFA'}
const planCol:Record<string,string>={trial:C.amber,starter:'#60A5FA',professional:C.purple,enterprise:C.green}
const statCol:Record<string,string>={trial:C.amber,active:C.green,suspended:C.red,cancelled:C.t3}

// ── Currency config — correct ISO designations ────────────────────────────────
const CURRENCIES=['USD','AUD','NZD','GBP','EUR']
const CURR_LABEL:Record<string,string>={USD:'USD — US Dollar',AUD:'AUD — Australian Dollar',NZD:'NZD — New Zealand Dollar',GBP:'GBP — British Pound',EUR:'EUR — Euro'}
const CURR_SYM:Record<string,string>={USD:'$',AUD:'A$',NZD:'NZ$',GBP:'£',EUR:'€'}
// Mid-market FX rates (1 USD = X)
const FX:Record<string,number>={USD:1,AUD:1.55,NZD:1.65,GBP:0.78,EUR:0.92}

// Round to nearest $5 in local currency
function calcMonthlyPrice(usdMo:number,currency:string):number {
  const local=usdMo*FX[currency]
  return Math.round(Math.round(local/5)*5)
}

// Annual price = monthly × 12 × (1 - discountPct/100), rounded to nearest $5
function calcAnnualPrice(usdMo:number,currency:string,discountPct:number,promoDiscount=0):number {
  const monthly=calcMonthlyPrice(usdMo,currency)
  const totalDiscount=Math.min(discountPct+promoDiscount,100)
  const annual=monthly*12*(1-totalDiscount/100)
  return Math.round(Math.round(annual/5)*5)
}

// Shared styles
const s={
  card:{background:C.sur,border:`1px solid ${C.bdr}`,borderRadius:12,marginBottom:16} as React.CSSProperties,
  hdr:{padding:'12px 18px',borderBottom:`1px solid ${C.bdr}`,display:'flex',alignItems:'center',justifyContent:'space-between'} as React.CSSProperties,
  body:{padding:18} as React.CSSProperties,
  th:{textAlign:'left' as const,padding:'8px 12px',fontSize:10,textTransform:'uppercase' as const,letterSpacing:'0.1em',color:C.t3,borderBottom:`1px solid ${C.bdr}`,fontWeight:700},
  td:{padding:'10px 12px',borderBottom:'1px solid rgba(50,77,114,0.3)',fontSize:13},
  inp:{background:C.sur2,border:`1px solid ${C.bdr}`,borderRadius:8,padding:'8px 12px',color:C.t1,fontSize:13,outline:'none',fontFamily:'inherit'} as React.CSSProperties,
  sel:{background:C.sur2,border:`1px solid ${C.bdr}`,borderRadius:8,padding:'7px 10px',color:C.t1,fontSize:13,cursor:'pointer',outline:'none'} as React.CSSProperties,
  kpi:{background:C.sur2,border:`1px solid ${C.bdr}`,borderRadius:10,padding:'14px 18px'} as React.CSSProperties,
  lbl:{color:C.t3,fontSize:12,marginBottom:5,display:'block'} as React.CSSProperties,
  nav:(a:boolean)=>({display:'flex',alignItems:'center',gap:10,padding:'9px 16px',cursor:'pointer',fontSize:13,color:a?C.tealL:C.t2,background:a?'rgba(14,165,160,0.12)':'transparent',borderLeft:`2px solid ${a?C.teal:'transparent'}`} as React.CSSProperties),
  btn:(bg:string,bdr?:string)=>({background:bg,border:`1px solid ${bdr??bg}`,borderRadius:7,padding:'6px 14px',color:bg==='transparent'?C.t2:'white',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'} as React.CSSProperties),
  badge:(c:string)=>({background:`${c}20`,border:`1px solid ${c}40`,borderRadius:12,padding:'2px 9px',fontSize:11,color:c,fontWeight:700}),
}

const NAV=[
  {id:'overview',icon:'⊞',label:'Overview'},
  {id:'orgs',icon:'🏢',label:'Organisations'},
  {id:'users',icon:'👤',label:'Users'},
  {id:'plans',icon:'💳',label:'Plans & Pricing'},
  {id:'promos',icon:'🎟',label:'Promo Codes'},
  {id:'trials',icon:'⏱',label:'Trial Monitor'},
  {id:'audit',icon:'◈',label:'Audit Log'},
  {id:'notifications',icon:'✉',label:'Notifications'},
  {id:'monitoring',icon:'⚡',label:'Monitoring'},
]

export default function AdminPage() {
  const [view,setView]=useState('overview')
  const [stats,setStats]=useState<Stats|null>(null)
  const [orgs,setOrgs]=useState<Org[]>([])
  const [users,setUsers]=useState<User[]>([])
  const [audit,setAudit]=useState<AuditEntry[]>([])
  const [promos,setPromos]=useState<PromoCode[]>([])
  const [plans,setPlans]=useState<Plan[]>([])
  const [loading,setLoading]=useState(false)
  const [accessErr,setAccessErr]=useState(false)
  const [editing,setEditing]=useState<any>(null)
  const [modal,setModal]=useState<string|null>(null)
  const [search,setSearch]=useState('')
  const [toast,setToast]=useState<string|null>(null)

  const showToast=useCallback((msg:string)=>{setToast(msg);setTimeout(()=>setToast(null),3500)},[])

  const load=useCallback(async(v=view)=>{
    setLoading(true)
    try {
      if(v==='overview'){
        const r=await fetch('/api/admin?view=overview')
        if(r.status===403){setAccessErr(true);setLoading(false);return}
        const d=await r.json()
        setStats(d.stats);setOrgs(d.recentOrgs??[])
      }
      if(v==='orgs'||v==='trials'){const d=await fetch('/api/admin?view=orgs').then(r=>r.json());setOrgs(d.orgs??[])}
      if(v==='users'){const d=await fetch('/api/admin?view=users').then(r=>r.json());setUsers(d.users??[])}
      if(v==='audit'){const d=await fetch('/api/admin?view=audit').then(r=>r.json());setAudit(d.logs??[])}
      if(v==='promos'){const d=await fetch('/api/admin?view=promos').then(r=>r.json());setPromos(d.promos??[])}
      if(v==='plans'){const d=await fetch('/api/admin/plans').then(r=>r.json());setPlans(d.plans??[])}
    } catch(e){showToast('Load error: '+(e as Error).message)}
    setLoading(false)
  },[view,showToast])

  useEffect(()=>{load(view)},[view])

  async function saveOrg(orgId:string,data:any){
    const r=await fetch('/api/admin',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({orgId,...data})})
    if(r.ok){setEditing(null);load(view);showToast('✓ Saved')}
    else{const d=await r.json();showToast('✗ '+(d.error??'Failed'))}
  }
  async function extendTrial(orgId:string,days:number){
    const r=await fetch('/api/admin',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({orgId,extendTrial:days})})
    if(r.ok){load(view);showToast(`✓ Trial extended +${days} days`)}
  }
  async function savePlan(planId:string,data:any){
    const r=await fetch('/api/admin/plans',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId,...data})})
    const d=await r.json()
    if(r.ok&&d.ok){load('plans');showToast('✓ Plan saved')}
    else showToast('✗ '+(d.error??'Failed'))
  }
  async function savePrice(priceId:string,amountDollars:number){
    const r=await fetch('/api/admin/plans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update-price',priceId,amount:Math.round(amountDollars*100)})})
    if(r.ok){load('plans');showToast('✓ Price updated')}
  }
  async function savePromo(data:any){
    const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save-promo',...data})})
    const d=await r.json()
    if(r.ok&&d.ok){setModal(null);load('promos');showToast('✓ Promo saved')}
    else showToast('✗ '+(d.error??'Save failed'))
  }
  async function togglePromo(id:string,active:boolean){
    await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'toggle-promo',id,active})})
    load('promos');showToast('✓ Updated')
  }
  async function syncStripe(){
    showToast('⟳ Syncing to Stripe...')
    const r=await fetch('/api/pricing',{method:'POST'})
    const d=await r.json()
    showToast(d.ok?`✓ Synced ${d.synced} prices`:'✗ '+(d.error??'Sync failed'))
    if(d.ok)load('plans')
  }

  const filtered=<T,>(items:T[])=>search?items.filter(i=>JSON.stringify(i).toLowerCase().includes(search.toLowerCase())):items
  const fmtDate=(d:string|null)=>d?new Date(d).toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'2-digit'}):'—'
  const fmtDT=(d:string|null)=>d?new Date(d).toLocaleString('en-AU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—'
  const tdLeft=(t:string|null)=>t?Math.max(0,Math.ceil((new Date(t).getTime()-Date.now())/86400000)):null

  if(accessErr) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16,background:C.bg}}>
      <div style={{fontSize:32}}>⚡</div>
      <div style={{color:C.red,fontSize:18,fontWeight:600}}>Superadmin access required</div>
      <a href="/login" style={{color:C.tealL}}>Sign in →</a>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:C.bg,color:C.t2,fontFamily:'system-ui,sans-serif',display:'flex'}}>
      {toast&&<div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',background:C.sur,border:`1px solid ${C.bdr}`,borderRadius:10,padding:'10px 20px',fontSize:13,color:C.t1,zIndex:999,boxShadow:'0 8px 24px rgba(0,0,0,0.4)',whiteSpace:'nowrap'}}>{toast}</div>}

      {/* Sidebar */}
      <nav style={{width:220,background:C.sur,borderRight:`1px solid ${C.bdr}`,display:'flex',flexDirection:'column',flexShrink:0}}>
        <div style={{padding:'18px 16px',borderBottom:`1px solid ${C.bdr}`}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
            <span style={{color:C.red,fontSize:18}}>⚡</span>
            <span style={{color:C.t1,fontWeight:700,fontSize:15}}>Super Admin</span>
          </div>
          <div style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'0.1em'}}>CashFlow AI Platform</div>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'8px 0'}}>
          {NAV.map(n=>(
            <div key={n.id} style={s.nav(view===n.id)} onClick={()=>setView(n.id)}>
              <span style={{fontSize:14}}>{n.icon}</span><span>{n.label}</span>
            </div>
          ))}
        </div>
        <div style={{padding:'12px 16px',borderTop:`1px solid ${C.bdr}`,display:'flex',flexDirection:'column',gap:6}}>
          <a href="/app" style={{color:C.t3,fontSize:12,textDecoration:'none'}}>← Back to app</a>
          <a href="/landing" style={{color:C.t3,fontSize:12,textDecoration:'none'}}>← Landing page</a>
        </div>
      </nav>

      {/* Main */}
      <main style={{flex:1,padding:28,overflowY:'auto'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
          <div>
            <div style={{color:C.t1,fontSize:20,fontWeight:700}}>{NAV.find(n=>n.id===view)?.label}</div>
            <div style={{color:C.t3,fontSize:12,marginTop:2}}>CashFlow AI · Superadmin Console</div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {['orgs','users','audit','promos'].includes(view)&&(
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." style={{...s.inp,width:200}} />
            )}
            <button style={s.btn(C.teal)} onClick={()=>load(view)}>↻ Refresh</button>
          </div>
        </div>
        {loading&&<div style={{color:C.t3,fontSize:13,marginBottom:16}}>Loading...</div>}

        {/* OVERVIEW */}
        {view==='overview'&&stats&&(<>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:12,marginBottom:20}}>
            {[{l:'Total Orgs',v:stats.orgs,c:C.t1},{l:'Active',v:stats.activeOrgs,c:C.green},{l:'Trial',v:stats.trialOrgs,c:C.amber},
              {l:'Users',v:stats.users,c:C.t2},{l:'Sessions',v:stats.batches,c:C.t2},{l:'Allocations',v:stats.allocations,c:C.t2},
              {l:'MRR',v:`$${(stats.mrr??0).toLocaleString()}`,c:C.tealL}].map(k=>(
              <div key={k.l} style={s.kpi}>
                <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'0.1em',color:C.t3,marginBottom:6}}>{k.l}</div>
                <div style={{fontSize:22,fontWeight:700,color:k.c,fontFamily:'monospace'}}>{k.v}</div>
              </div>
            ))}
          </div>
          <div style={s.card}>
            <div style={s.hdr}><span style={{color:C.t1,fontWeight:600,fontSize:13}}>Recent Organisations</span></div>
            <OrgTable orgs={orgs.slice(0,8)} s={s} C={C} planCol={planCol} statCol={statCol} fmtDate={fmtDate} tdLeft={tdLeft} onEdit={setEditing} onExtend={extendTrial}/>
          </div>
        </>)}

        {/* ORGS */}
        {view==='orgs'&&(
          <div style={s.card}>
            <div style={s.hdr}><span style={{color:C.t1,fontWeight:600,fontSize:13}}>All Organisations ({filtered(orgs).length})</span></div>
            <OrgTable orgs={filtered(orgs)} s={s} C={C} planCol={planCol} statCol={statCol} fmtDate={fmtDate} tdLeft={tdLeft} onEdit={setEditing} onExtend={extendTrial}/>
          </div>
        )}

        {/* USERS */}
        {view==='users'&&(
          <div style={s.card}>
            <div style={s.hdr}><span style={{color:C.t1,fontWeight:600,fontSize:13}}>All Users ({filtered(users).length})</span></div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['Name','Email','Org','Role','Status','Last Login','Failed Logins'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered(users).map((u:any)=>(
                  <tr key={u.id}>
                    <td style={{...s.td,color:C.t1,fontWeight:500}}>{u.name}</td>
                    <td style={{...s.td,fontSize:11,fontFamily:'monospace',color:C.t3}}>{u.email}</td>
                    <td style={{...s.td,fontSize:12}}>{u.org?.name??'—'}</td>
                    <td style={s.td}><span style={s.badge(u.role==='superadmin'?C.red:u.role==='admin'?C.purple:C.teal)}>{u.role}</span></td>
                    <td style={s.td}><span style={s.badge(u.status==='active'?C.green:C.red)}>{u.status}</span></td>
                    <td style={{...s.td,fontSize:11,color:C.t3}}>{fmtDT(u.lastLoginAt)}</td>
                    <td style={{...s.td,textAlign:'center',color:u.failedLogins>0?C.amber:C.t3}}>{u.failedLogins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PLANS & PRICING */}
        {view==='plans'&&(
          <PlansEditor plans={plans} s={s} C={C} CURRENCIES={CURRENCIES} CURR_LABEL={CURR_LABEL} CURR_SYM={CURR_SYM}
            calcMonthlyPrice={calcMonthlyPrice} calcAnnualPrice={calcAnnualPrice}
            onSave={savePlan} onSyncStripe={syncStripe} onSavePrice={savePrice} showToast={showToast}/>
        )}

        {/* PROMO CODES */}
        {view==='promos'&&(
          <div style={s.card}>
            <div style={s.hdr}>
              <span style={{color:C.t1,fontWeight:600,fontSize:13}}>Promo Codes ({promos.length})</span>
              <button style={s.btn(C.teal)} onClick={()=>setModal('new-promo')}>+ New Promo</button>
            </div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['Code','Discount','Used','Expires','Plans','Status','Actions'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered(promos).map(p=>(
                  <tr key={p.id}>
                    <td style={{...s.td,fontFamily:'monospace',color:C.tealL,fontWeight:700}}>{p.code}</td>
                    <td style={{...s.td,color:C.green}}>{p.discountValue}% off</td>
                    <td style={s.td}>{p.redemptions}{p.maxRedemptions?` / ${p.maxRedemptions}`:' / ∞'}</td>
                    <td style={{...s.td,fontSize:11,color:C.t3}}>{p.validUntil?new Date(p.validUntil).toLocaleDateString('en-AU'):'No expiry'}</td>
                    <td style={{...s.td,fontSize:11}}>{p.planCodes.length?p.planCodes.join(', '):'All plans'}</td>
                    <td style={s.td}><span style={s.badge(p.active?C.green:C.red)}>{p.active?'Active':'Inactive'}</span></td>
                    <td style={s.td}><button style={s.btn(C.sur2,C.bdr)} onClick={()=>togglePromo(p.id,!p.active)}>{p.active?'Disable':'Enable'}</button></td>
                  </tr>
                ))}
                {promos.length===0&&<tr><td colSpan={7} style={{...s.td,textAlign:'center',color:C.t3,padding:32}}>No promo codes. Create one above.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* TRIAL MONITOR */}
        {view==='trials'&&<TrialMonitor orgs={orgs} s={s} C={C} planCol={planCol} fmtDate={fmtDate} tdLeft={tdLeft} onExtend={extendTrial}/>}

        {/* AUDIT LOG */}
        {view==='audit'&&(
          <div style={s.card}>
            <div style={s.hdr}><span style={{color:C.t1,fontWeight:600,fontSize:13}}>Audit Log ({filtered(audit).length})</span></div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['Time','Org','Category','Event','Message','Actor'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered(audit).map(e=>(
                  <tr key={e.id}>
                    <td style={{...s.td,fontSize:11,color:C.t3,whiteSpace:'nowrap'}}>{fmtDT(e.timestamp)}</td>
                    <td style={{...s.td,fontSize:11}}>{e.org?.name??'—'}</td>
                    <td style={s.td}><span style={s.badge(e.category==='security'?C.red:e.category==='approve'?C.green:C.teal)}>{e.category}</span></td>
                    <td style={{...s.td,fontSize:11,fontFamily:'monospace',color:C.tealL}}>{e.event}</td>
                    <td style={{...s.td,fontSize:12,maxWidth:320,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.message}</td>
                    <td style={{...s.td,fontSize:11,color:C.t3}}>{e.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* NOTIFICATIONS */}
        {view==='notifications'&&<NotificationsPanel s={s} C={C} showToast={showToast}/>}

        {/* MONITORING */}
        {view==='monitoring'&&<MonitoringPanel s={s} C={C}/>}
      </main>

      {/* Modals */}
      {editing&&<Modal title={`Edit — ${editing.name}`} onClose={()=>setEditing(null)} C={C}>
        <EditOrgForm org={editing} s={s} C={C} onSave={saveOrg} onClose={()=>setEditing(null)} onExtend={extendTrial}/>
      </Modal>}
      {modal==='new-promo'&&<Modal title="New Promo Code" onClose={()=>setModal(null)} C={C}>
        <NewPromoForm s={s} C={C} onSave={savePromo} onClose={()=>setModal(null)}/>
      </Modal>}
    </div>
  )
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({title,onClose,children,C}:any){
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:900,padding:20}}>
      <div style={{background:C.sur,border:`1px solid ${C.bdr}`,borderRadius:14,width:540,maxHeight:'90vh',overflow:'auto'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',borderBottom:`1px solid ${C.bdr}`}}>
          <div style={{color:C.t1,fontWeight:700,fontSize:15}}>{title}</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.t3,cursor:'pointer',fontSize:18}}>✕</button>
        </div>
        <div style={{padding:20}}>{children}</div>
      </div>
    </div>
  )
}

// ── Org Table ─────────────────────────────────────────────────────────────────
function OrgTable({orgs,s,C,planCol,statCol,fmtDate,tdLeft,onEdit,onExtend}:any){
  return(
    <table style={{width:'100%',borderCollapse:'collapse'}}>
      <thead><tr>{['Org','Plan','Status','Users','Sessions','MRR','Trial/Created','Actions'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
      <tbody>
        {orgs.map((o:any)=>{
          const td=tdLeft(o.trialEndsAt)
          return(
            <tr key={o.id}>
              <td style={{...s.td,color:C.t1,fontWeight:500}}><div>{o.name}</div><div style={{fontSize:10,color:C.t3,fontFamily:'monospace'}}>{o.slug}</div></td>
              <td style={s.td}><span style={{background:`${planCol[o.plan]??C.t3}20`,border:`1px solid ${planCol[o.plan]??C.t3}40`,borderRadius:12,padding:'2px 9px',fontSize:11,color:planCol[o.plan]??C.t3,fontWeight:700}}>{o.plan}</span></td>
              <td style={s.td}><span style={{background:`${statCol[o.status]??C.t3}20`,border:`1px solid ${statCol[o.status]??C.t3}40`,borderRadius:12,padding:'2px 9px',fontSize:11,color:statCol[o.status]??C.t3,fontWeight:700}}>{o.status}</span></td>
              <td style={{...s.td,textAlign:'center'}}>{o._count?.users??0}</td>
              <td style={{...s.td,textAlign:'center'}}>{o._count?.sessions??0}</td>
              <td style={{...s.td,fontFamily:'monospace',color:C.tealL}}>${o.mrr??0}</td>
              <td style={{...s.td,fontSize:11}}>{o.status==='trial'&&td!==null?<span style={{color:td<=3?C.red:td<=7?C.amber:C.green,fontWeight:600}}>{td}d left</span>:fmtDate(o.createdAt)}</td>
              <td style={s.td}>
                <div style={{display:'flex',gap:5}}>
                  <button style={s.btn(C.sur2,C.bdr)} onClick={()=>onEdit(o)}>Edit</button>
                  {o.status==='trial'&&<button style={s.btn(C.sur2,C.bdr)} onClick={()=>onExtend(o.id,7)}>+7d</button>}
                </div>
              </td>
            </tr>
          )
        })}
        {orgs.length===0&&<tr><td colSpan={8} style={{...s.td,textAlign:'center',color:C.t3,padding:32}}>No organisations found</td></tr>}
      </tbody>
    </table>
  )
}

// ── Edit Org Form ─────────────────────────────────────────────────────────────
function EditOrgForm({org,s,C,onSave,onClose,onExtend}:any){
  const [form,setForm]=useState({plan:org.plan,status:org.status,mrr:org.mrr??0,maxUsers:org.maxUsers,maxBatches:org.maxBatches})
  const set=(k:string,v:any)=>setForm(f=>({...f,[k]:v}))
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div>
          <label style={s.lbl}>Plan</label>
          <select style={{...s.sel,width:'100%'}} value={form.plan} onChange={e=>set('plan',e.target.value)}>
            {['trial','starter','professional','enterprise'].map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label style={s.lbl}>Status</label>
          <select style={{...s.sel,width:'100%'}} value={form.status} onChange={e=>set('status',e.target.value)}>
            {['trial','active','suspended','cancelled'].map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label style={s.lbl}>MRR ($)</label>
          <input type="number" style={{...s.inp,width:'100%',boxSizing:'border-box'}} value={form.mrr} onChange={e=>set('mrr',parseInt(e.target.value)||0)}/>
        </div>
        <div>
          <label style={s.lbl}>Max Users</label>
          <input type="number" style={{...s.inp,width:'100%',boxSizing:'border-box'}} value={form.maxUsers} onChange={e=>set('maxUsers',parseInt(e.target.value)||1)}/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={s.lbl}>Max Batch Runs / Month</label>
          <input type="number" style={{...s.inp,width:'100%',boxSizing:'border-box'}} value={form.maxBatches===999999?'':form.maxBatches} placeholder="999999 = unlimited" onChange={e=>set('maxBatches',parseInt(e.target.value)||20)}/>
        </div>
      </div>
      {org.status==='trial'&&(
        <div style={{display:'flex',gap:8,alignItems:'center',padding:'10px 14px',background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:8}}>
          <span style={{color:C.amber,fontSize:12}}>Extend trial:</span>
          {[7,14,30].map(d=><button key={d} style={s.btn(C.sur2,C.bdr)} onClick={()=>onExtend(org.id,d)}>+{d} days</button>)}
        </div>
      )}
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',borderTop:`1px solid ${C.bdr}`,paddingTop:14}}>
        <button style={s.btn('transparent',C.bdr)} onClick={onClose}>Cancel</button>
        <button style={s.btn(C.teal)} onClick={()=>onSave(org.id,form)}>Save changes</button>
      </div>
    </div>
  )
}

// ── Plans Editor (the main event) ─────────────────────────────────────────────
function PlansEditor({plans,s,C,CURRENCIES,CURR_LABEL,CURR_SYM,calcMonthlyPrice,calcAnnualPrice,onSave,onSyncStripe,onSavePrice,showToast}:any){
  const [expanded,setExpanded]=useState<string|null>(null)
  const [editForm,setEditForm]=useState<any>(null)
  const [saving,setSaving]=useState(false)
  const [promoPreview,setPromoPreview]=useState(0) // additional promo % for preview

  function startEdit(plan:Plan){
    setExpanded(plan.id)
    setEditForm({
      name:plan.name,
      description:plan.description??'',
      maxUsers:plan.maxUsers,
      maxBatches:plan.maxBatches>=999999?'unlimited':plan.maxBatches,
      baseUsdMonth:plan.baseUsdMonth?Math.round(plan.baseUsdMonth/100):0,
      annualDiscountPct:plan.annualDiscountPct??20,
      features:Array.isArray(plan.features)?plan.features.join('\n'):'',
      recalcPrices:true,
    })
  }

  async function doSave(planId:string){
    if(!editForm)return
    setSaving(true)
    const maxBatches=editForm.maxBatches==='unlimited'?999999:parseInt(editForm.maxBatches)||200
    await onSave(planId,{
      name:editForm.name,
      description:editForm.description,
      maxUsers:parseInt(editForm.maxUsers),
      maxBatches,
      baseUsdMonth:Math.round(parseFloat(editForm.baseUsdMonth)*100),
      annualDiscountPct:parseInt(editForm.annualDiscountPct)||20,
      features:editForm.features.split('\n').map((l:string)=>l.trim()).filter(Boolean),
      recalcPrices:editForm.recalcPrices,
    })
    setSaving(false)
    setExpanded(null)
  }

  if(plans.length===0) return(
    <div style={s.card}>
      <div style={s.hdr}><span style={{color:C.t1,fontWeight:600,fontSize:13}}>Plans & Pricing</span></div>
      <div style={{...s.body,color:C.t3}}>
        <p style={{marginBottom:12}}>No plans found. Run the seed command then refresh:</p>
        <div style={{background:C.sur2,border:`1px solid ${C.bdr}`,borderRadius:8,padding:'10px 14px',fontFamily:'monospace',fontSize:12,color:C.tealL}}>
          {'$env:DATABASE_URL="..."'}<br/>
          npx prisma db push<br/>
          npx prisma generate<br/>
          npm run db:seed-pricing
        </div>
        <button style={{...s.btn(C.teal),marginTop:14}} onClick={()=>window.location.reload()}>↻ Refresh after seeding</button>
      </div>
    </div>
  )

  return(
    <div>
      {/* Header bar */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{color:C.t3,fontSize:13}}>
          Prices are USD-anchored · converted at mid-market FX · rounded to nearest $5 · annual discount is configurable per plan
        </div>
        <button style={s.btn(C.teal)} onClick={onSyncStripe}>⇅ Sync to Stripe</button>
      </div>

      {/* FX rates reference */}
      <div style={{...s.card,marginBottom:16}}>
        <div style={s.hdr}><span style={{color:C.t1,fontWeight:600,fontSize:13}}>FX Reference Rates (1 USD =)</span></div>
        <div style={{...s.body,display:'flex',gap:24,flexWrap:'wrap'}}>
          {CURRENCIES.filter((c:string)=>c!=='USD').map((c:string)=>(
            <div key={c} style={{textAlign:'center'}}>
              <div style={{color:C.t3,fontSize:11}}>{CURR_LABEL[c]}</div>
              <div style={{color:C.t1,fontSize:18,fontWeight:700,fontFamily:'monospace'}}>{CURR_SYM[c]}{FX[c].toFixed(2)}</div>
            </div>
          ))}
          <div style={{flex:1,color:C.t3,fontSize:11,alignSelf:'center'}}>
            To update FX rates, edit FX object in <code style={{color:C.tealL}}>src/app/admin/page.tsx</code> and <code style={{color:C.tealL}}>src/app/api/admin/plans/route.ts</code>
          </div>
        </div>
      </div>

      {/* Annual promo preview */}
      <div style={{...s.card,marginBottom:16}}>
        <div style={s.hdr}><span style={{color:C.t1,fontWeight:600,fontSize:13}}>Annual Price Preview — with Promo</span></div>
        <div style={{...s.body,display:'flex',gap:16,alignItems:'center'}}>
          <div style={{color:C.t3,fontSize:13}}>Simulate additional promo discount on top of annual discount:</div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <input type="number" min="0" max="100" value={promoPreview} onChange={e=>setPromoPreview(parseInt(e.target.value)||0)}
              style={{...s.inp,width:70}} />
            <span style={{color:C.t3,fontSize:13}}>% promo</span>
          </div>
          <div style={{color:C.t3,fontSize:12}}>→ Annual = monthly × 12 × (1 − plan_annual_% − promo_%)</div>
        </div>
      </div>

      {/* One card per plan */}
      {plans.map((plan:Plan)=>{
        const isOpen=expanded===plan.id
        const usdMo=plan.baseUsdMonth?Math.round(plan.baseUsdMonth/100):0
        const discPct=plan.annualDiscountPct??20

        return(
          <div key={plan.id} style={s.card}>
            {/* Plan header */}
            <div style={s.hdr}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <span style={{color:C.t1,fontWeight:700,fontSize:16}}>{plan.name}</span>
                <span style={s.badge(planCol[plan.code]??C.t3)}>{plan.code}</span>
                <span style={{color:C.t3,fontSize:12}}>{plan.description}</span>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <div style={{color:C.t3,fontSize:12}}>{plan.maxUsers} users · {plan.maxBatches>=999999?'∞':plan.maxBatches} runs/mo · {discPct}% annual discount</div>
                <button style={s.btn(isOpen?C.teal:C.sur2,isOpen?undefined:C.bdr)} onClick={()=>{
                  if(isOpen){setExpanded(null);setEditForm(null)}else startEdit(plan)
                }}>
                  {isOpen?'✕ Close':'✎ Edit plan'}
                </button>
              </div>
            </div>

            {/* EDITOR — shown when expanded */}
            {isOpen&&editForm&&(
              <div style={{padding:20,background:'rgba(14,165,160,0.05)',borderBottom:`1px solid ${C.bdr}`}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:16}}>
                  <div>
                    <label style={s.lbl}>Plan Name</label>
                    <input style={{...s.inp,width:'100%',boxSizing:'border-box'}} value={editForm.name} onChange={e=>setEditForm((f:any)=>({...f,name:e.target.value}))}/>
                  </div>
                  <div>
                    <label style={s.lbl}>Max Users</label>
                    <input type="number" style={{...s.inp,width:'100%',boxSizing:'border-box'}} value={editForm.maxUsers} onChange={e=>setEditForm((f:any)=>({...f,maxUsers:e.target.value}))}/>
                  </div>
                  <div>
                    <label style={s.lbl}>Max Batch Runs / Month</label>
                    <input style={{...s.inp,width:'100%',boxSizing:'border-box'}} value={editForm.maxBatches} placeholder="200 or 'unlimited'" onChange={e=>setEditForm((f:any)=>({...f,maxBatches:e.target.value}))}/>
                  </div>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:14,marginBottom:16}}>
                  <div>
                    <label style={s.lbl}>Description</label>
                    <input style={{...s.inp,width:'100%',boxSizing:'border-box'}} value={editForm.description} onChange={e=>setEditForm((f:any)=>({...f,description:e.target.value}))}/>
                  </div>
                  <div>
                    <label style={s.lbl}>Base USD / month ($)</label>
                    <input type="number" style={{...s.inp,width:'100%',boxSizing:'border-box'}} value={editForm.baseUsdMonth} onChange={e=>setEditForm((f:any)=>({...f,baseUsdMonth:e.target.value}))}/>
                  </div>
                  <div>
                    <label style={s.lbl}>Annual discount %</label>
                    <input type="number" min="0" max="100" style={{...s.inp,width:'100%',boxSizing:'border-box'}} value={editForm.annualDiscountPct} onChange={e=>setEditForm((f:any)=>({...f,annualDiscountPct:e.target.value}))}/>
                  </div>
                </div>

                {/* Live price preview */}
                {editForm.baseUsdMonth>0&&(
                  <div style={{marginBottom:16,padding:'12px 16px',background:C.sur2,borderRadius:8,border:`1px solid ${C.bdr}`}}>
                    <div style={{color:C.t3,fontSize:11,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em'}}>
                      Live price preview — USD ${editForm.baseUsdMonth}/mo · {editForm.annualDiscountPct}% annual discount
                    </div>
                    <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
                      {CURRENCIES.map((c:string)=>{
                        const mo=calcMonthlyPrice(parseFloat(editForm.baseUsdMonth),c)
                        const yr=calcAnnualPrice(parseFloat(editForm.baseUsdMonth),c,parseInt(editForm.annualDiscountPct)||20)
                        const sym=CURR_SYM[c]
                        return(
                          <div key={c} style={{textAlign:'center',minWidth:80}}>
                            <div style={{color:C.t3,fontSize:10,textTransform:'uppercase'}}>{c}</div>
                            <div style={{color:C.t1,fontSize:14,fontWeight:700,fontFamily:'monospace'}}>{sym}{mo}/mo</div>
                            <div style={{color:C.tealL,fontSize:11,fontFamily:'monospace'}}>{sym}{yr}/yr</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div style={{marginBottom:16}}>
                  <label style={s.lbl}>Features (one per line)</label>
                  <textarea style={{...s.inp,width:'100%',boxSizing:'border-box',minHeight:90,resize:'vertical'}} value={editForm.features} onChange={e=>setEditForm((f:any)=>({...f,features:e.target.value}))}/>
                </div>

                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <button style={s.btn(C.teal)} onClick={()=>doSave(plan.id)} disabled={saving}>{saving?'Saving...':'Save plan'}</button>
                  <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:C.t2,cursor:'pointer'}}>
                    <input type="checkbox" checked={editForm.recalcPrices} onChange={e=>setEditForm((f:any)=>({...f,recalcPrices:e.target.checked}))} style={{accentColor:C.teal}}/>
                    Recalculate all currency prices from USD base
                  </label>
                  <button style={s.btn('transparent',C.bdr)} onClick={()=>{setExpanded(null);setEditForm(null)}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Price matrix */}
            <div style={s.body}>
              <div style={{fontSize:11,color:C.t3,marginBottom:12,textTransform:'uppercase',letterSpacing:'0.08em'}}>
                Price Matrix · click any price to edit inline
              </div>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr>
                    <th style={s.th}>Currency</th>
                    <th style={s.th}>Monthly price</th>
                    <th style={s.th}>Annual total</th>
                    <th style={s.th}>Equiv / month</th>
                    <th style={s.th}>Annual discount</th>
                    <th style={s.th}>+Promo ({promoPreview}%) annual</th>
                    <th style={s.th}>Stripe status</th>
                  </tr>
                </thead>
                <tbody>
                  {CURRENCIES.map((currency:string)=>{
                    const mo=plan.prices.find((p:PlanPrice)=>p.currency===currency&&p.interval==='month')
                    const yr=plan.prices.find((p:PlanPrice)=>p.currency===currency&&p.interval==='year')
                    const sym=CURR_SYM[currency]
                    const moPx=mo?mo.amount/100:0
                    const yrPx=yr?yr.amount/100:0
                    const moEquiv=yrPx?Math.round(yrPx/12):0
                    const actualDisc=moPx&&moEquiv?Math.round((1-moEquiv/moPx)*100):discPct
                    const withPromo=promoPreview>0&&moPx?Math.round(Math.round(yrPx*(1-promoPreview/100)/5)*5):null
                    return(
                      <tr key={currency}>
                        <td style={{...s.td}}>
                          <div style={{fontWeight:700,color:C.t1}}>{currency}</div>
                          <div style={{fontSize:10,color:C.t3}}>{CURR_LABEL[currency]}</div>
                        </td>
                        <td style={s.td}>{mo?<InlinePrice value={moPx} sym={sym} suffix="/mo" priceId={mo.id} onSave={onSavePrice} s={s} C={C}/>:<span style={{color:C.t3}}>—</span>}</td>
                        <td style={s.td}>{yr?<InlinePrice value={yrPx} sym={sym} suffix="/yr" priceId={yr.id} onSave={onSavePrice} s={s} C={C}/>:<span style={{color:C.t3}}>—</span>}</td>
                        <td style={{...s.td,fontFamily:'monospace',color:C.tealL}}>{moEquiv?`${sym}${moEquiv}/mo`:'—'}</td>
                        <td style={{...s.td}}>
                          <span style={{color:C.green,fontWeight:600}}>{actualDisc>0?`${actualDisc}%`:'-'}</span>
                          {actualDisc>0&&moPx&&<div style={{fontSize:10,color:C.t3}}>Save {sym}{Math.round((moPx*12-yrPx))}/yr</div>}
                        </td>
                        <td style={s.td}>
                          {withPromo!==null?<span style={{color:C.amber,fontFamily:'monospace',fontWeight:600}}>{sym}{withPromo}/yr</span>:<span style={{color:C.t3}}>—</span>}
                        </td>
                        <td style={{...s.td,fontSize:10,fontFamily:'monospace'}}>
                          {mo?.stripePriceId
                            ?<span style={{color:C.green}}>✓ {mo.stripePriceId.slice(0,18)}...</span>
                            :<span style={{color:C.t3}}>Not synced</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Inline editable price cell ────────────────────────────────────────────────
function InlinePrice({value,sym,suffix,priceId,onSave,s,C}:any){
  const [editing,setEditing]=useState(false)
  const [val,setVal]=useState(String(value))
  if(!priceId)return<span style={{color:C.t3}}>—</span>
  return editing?(
    <div style={{display:'flex',gap:4,alignItems:'center'}}>
      <span style={{color:C.t3,fontSize:11}}>{sym}</span>
      <input type="number" value={val} onChange={e=>setVal(e.target.value)}
        style={{...s.inp,width:80,padding:'4px 6px',fontSize:12}} autoFocus
        onKeyDown={e=>{if(e.key==='Enter'){onSave(priceId,parseFloat(val));setEditing(false)}if(e.key==='Escape')setEditing(false)}}/>
      <button style={{...s.btn(C.teal),padding:'3px 8px',fontSize:11}} onClick={()=>{onSave(priceId,parseFloat(val));setEditing(false)}}>✓</button>
      <button style={{...s.btn('transparent',C.bdr),padding:'3px 8px',fontSize:11}} onClick={()=>setEditing(false)}>✕</button>
    </div>
  ):(
    <span onClick={()=>{setVal(String(value));setEditing(true)}}
      style={{cursor:'pointer',fontFamily:'monospace',color:C.t1,borderBottom:`1px dashed ${C.bdr}`,fontSize:13}} title="Click to edit">
      {sym}{value}{suffix}
    </span>
  )
}

// ── New Promo Form ────────────────────────────────────────────────────────────
function NewPromoForm({s,C,onSave,onClose}:any){
  const [form,setForm]=useState({code:'',discountValue:'20',maxRedemptions:'100',validUntil:'',planCodes:[] as string[]})
  const set=(k:string,v:any)=>setForm(f=>({...f,[k]:v}))
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      {[['Code (uppercase)','code','text','LAUNCH50'],['Discount %','discountValue','number','20'],['Max uses (blank = unlimited)','maxRedemptions','number','100'],['Expires (blank = no expiry)','validUntil','date','']].map(([label,key,type,ph])=>(
        <div key={key}>
          <label style={s.lbl}>{label}</label>
          <input type={type} placeholder={ph} style={{...s.inp,width:'100%',boxSizing:'border-box'}}
            value={(form as any)[key]}
            onChange={e=>set(key as string,type==='number'?e.target.value:e.target.value.toUpperCase())}/>
        </div>
      ))}
      <div>
        <label style={s.lbl}>Apply to plans (unticked = all plans)</label>
        <div style={{display:'flex',gap:14}}>
          {['starter','professional','enterprise'].map(p=>(
            <label key={p} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:13,color:C.t2}}>
              <input type="checkbox" checked={form.planCodes.includes(p)} onChange={e=>set('planCodes',e.target.checked?[...form.planCodes,p]:form.planCodes.filter((x:string)=>x!==p))} style={{accentColor:C.teal}}/>
              {p}
            </label>
          ))}
        </div>
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',borderTop:`1px solid ${C.bdr}`,paddingTop:14}}>
        <button style={s.btn('transparent',C.bdr)} onClick={onClose}>Cancel</button>
        <button style={s.btn(C.teal)} onClick={()=>onSave({code:form.code,discountType:'percent',discountValue:parseInt(form.discountValue)||20,maxRedemptions:form.maxRedemptions?parseInt(form.maxRedemptions):null,validUntil:form.validUntil||null,planCodes:form.planCodes})}>
          Create promo
        </button>
      </div>
    </div>
  )
}

// ── Trial Monitor ─────────────────────────────────────────────────────────────
function TrialMonitor({orgs,s,C,planCol,fmtDate,tdLeft,onExtend}:any){
  const trials=orgs.filter((o:any)=>o.status==='trial'||o.trialEndsAt).sort((a:any,b:any)=>(tdLeft(a.trialEndsAt)??999)-(tdLeft(b.trialEndsAt)??999))
  const urg=(d:number|null)=>d===null?C.t3:d<=0?C.red:d<=3?C.red:d<=7?C.amber:C.green
  return(
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        {[{l:'On Trial',v:trials.length,c:C.amber},{l:'Expiring ≤3d',v:trials.filter((o:any)=>{const d=tdLeft(o.trialEndsAt);return d!==null&&d<=3}).length,c:C.red},
          {l:'Expiring ≤7d',v:trials.filter((o:any)=>{const d=tdLeft(o.trialEndsAt);return d!==null&&d<=7}).length,c:C.amber},
          {l:'Expired',v:trials.filter((o:any)=>{const d=tdLeft(o.trialEndsAt);return d!==null&&d<=0}).length,c:C.red}
        ].map(k=><div key={k.l} style={{...s.kpi}}><div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'0.1em',color:C.t3,marginBottom:6}}>{k.l}</div><div style={{fontSize:28,fontWeight:700,color:k.c}}>{k.v}</div></div>)}
      </div>
      <div style={s.card}>
        <div style={s.hdr}><span style={{color:C.t1,fontWeight:600,fontSize:13}}>Active Trials ({trials.length})</span></div>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr>{['Org','Plan','Expires','Days Left','Users','Sessions','Actions'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {trials.map((o:any)=>{
              const td=tdLeft(o.trialEndsAt)
              return(
                <tr key={o.id}>
                  <td style={{...s.td,color:C.t1,fontWeight:500}}>{o.name}</td>
                  <td style={s.td}><span style={{background:`${planCol[o.plan]??C.t3}20`,border:`1px solid ${planCol[o.plan]??C.t3}40`,borderRadius:12,padding:'2px 9px',fontSize:11,color:planCol[o.plan]??C.t3,fontWeight:700}}>{o.plan}</span></td>
                  <td style={{...s.td,fontSize:11,color:C.t3}}>{fmtDate(o.trialEndsAt)}</td>
                  <td style={s.td}><span style={{color:urg(td),fontWeight:700,fontSize:14}}>{td===null?'—':td<=0?'EXPIRED':`${td}d`}</span></td>
                  <td style={{...s.td,textAlign:'center'}}>{o._count?.users??0}</td>
                  <td style={{...s.td,textAlign:'center'}}>{o._count?.sessions??0}</td>
                  <td style={s.td}><div style={{display:'flex',gap:5}}>{[7,14,30].map(d=><button key={d} style={s.btn(C.sur2,C.bdr)} onClick={()=>onExtend(o.id,d)}>+{d}d</button>)}</div></td>
                </tr>
              )
            })}
            {trials.length===0&&<tr><td colSpan={7} style={{...s.td,textAlign:'center',color:C.t3,padding:32}}>No active trials</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Notifications Panel ───────────────────────────────────────────────────────
function NotificationsPanel({s,C,showToast}:any){
  return(
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
      <div style={s.card}>
        <div style={s.hdr}><span style={{color:C.t1,fontWeight:600,fontSize:13}}>✉ ClickSend Config</span></div>
        <div style={s.body}>
          <p style={{color:C.t3,fontSize:12,marginBottom:16}}>Set in Vercel → Settings → Environment Variables. Known sender IDs: 6504, 6798, 6832, 7227, 7559, 32709</p>
          {[['CLICKSEND_USERNAME','Username (email)'],['CLICKSEND_API_KEY','API Key'],['CLICKSEND_FROM_NAME','From Name'],['CLICKSEND_FROM_EMAIL','From Email'],['CLICKSEND_EMAIL_ADDRESS_ID','Email Address ID']].map(([k,l])=>(
            <div key={k} style={{marginBottom:10}}>
              <label style={s.lbl}>{l}</label>
              <div style={{...s.inp,color:C.t3,fontSize:12,fontFamily:'monospace'}}>{k}</div>
            </div>
          ))}
          <div style={{display:'flex',gap:8,marginTop:16}}>
            <button style={s.btn(C.sur2,C.bdr)} onClick={async()=>{const r=await fetch('/api/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'test-email'})});const d=await r.json();showToast(d.ok?'✓ Test email sent':'✗ '+(d.error??'Failed'))}}>Test Email</button>
            <button style={s.btn(C.sur2,C.bdr)} onClick={async()=>{const r=await fetch('/api/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'test-sms'})});const d=await r.json();showToast(d.ok?'✓ SMS sent':'✗ '+(d.error??'Failed'))}}>Test SMS</button>
          </div>
        </div>
      </div>
      <div style={s.card}>
        <div style={s.hdr}><span style={{color:C.t1,fontWeight:600,fontSize:13}}>📋 Event Triggers</span></div>
        <div style={s.body}>
          {[{i:'✓',e:'Batch complete',d:'Automation run finished'},{i:'⚠',e:'Exception alert',d:'Exceptions need review'},{i:'✦',e:'Approval required',d:'High-value sign-off'},{i:'⬢',e:'ERP export ready',d:'File ready to post'},{i:'⏱',e:'Trial expiry',d:'At 7, 3, 1 days'},{i:'💳',e:'Payment failed',d:'Stripe payment failure'}].map(n=>(
            <div key={n.e} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 0',borderBottom:'1px solid rgba(50,77,114,0.3)'}}>
              <span style={{fontSize:16,width:24}}>{n.i}</span>
              <div style={{flex:1}}><div style={{color:C.t1,fontSize:13,fontWeight:500}}>{n.e}</div><div style={{color:C.t3,fontSize:11}}>{n.d}</div></div>
              <div style={{width:8,height:8,borderRadius:'50%',background:C.green}}></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Monitoring Panel ──────────────────────────────────────────────────────────
function MonitoringPanel({s,C}:any){
  const [health,setHealth]=useState<any>(null)
  useEffect(()=>{fetch('/api/health').then(r=>r.json()).then(setHealth).catch(()=>setHealth({status:'error',checks:{}}));},[])
  return(
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
      <div style={s.card}>
        <div style={s.hdr}><span style={{color:C.t1,fontWeight:600,fontSize:13}}>⚡ Platform Health</span><button style={s.btn(C.sur2,C.bdr)} onClick={()=>fetch('/api/health').then(r=>r.json()).then(setHealth)}>↻ Recheck</button></div>
        <div style={s.body}>
          {!health?<div style={{color:C.t3}}>Checking...</div>:(
            <>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
                <div style={{width:48,height:48,borderRadius:'50%',background:`${health.status==='healthy'?C.green:C.amber}20`,border:`2px solid ${health.status==='healthy'?C.green:C.amber}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>{health.status==='healthy'?'✓':'⚠'}</div>
                <div><div style={{color:health.status==='healthy'?C.green:C.amber,fontWeight:700,fontSize:16,textTransform:'uppercase'}}>{health.status}</div><div style={{color:C.t3,fontSize:12}}>{health.totalMs}ms · {health.env} · {health.region}</div></div>
              </div>
              {Object.entries(health.checks??{}).map(([k,v]:any)=>(
                <div key={k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid rgba(50,77,114,0.3)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}><span style={{color:v.ok?C.green:C.red,fontSize:16}}>{v.ok?'✓':'✗'}</span><span style={{color:C.t1,fontSize:14,textTransform:'capitalize'}}>{k}</span></div>
                  <div>{v.ms&&<span style={{color:C.t3,fontSize:11}}>{v.ms}ms</span>}{v.error&&<span style={{color:C.red,fontSize:11,marginLeft:8}}>{v.error.slice(0,35)}</span>}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      <div style={s.card}>
        <div style={s.hdr}><span style={{color:C.t1,fontWeight:600,fontSize:13}}>📊 System Info</span></div>
        <div style={s.body}>
          {[['Version','1.0.0'],['Stack','Next.js 15 · Prisma 6 · Neon'],['Auth','NextAuth v5 · JWT 8hr'],['AI','claude-sonnet-4-20250514'],['Email/SMS','ClickSend'],['Billing','Stripe'],['Hosting','Vercel syd1'],['Cron','Daily + 15min']].map(([l,v])=>(
            <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid rgba(50,77,114,0.3)'}}>
              <span style={{color:C.t3,fontSize:13}}>{l}</span><span style={{color:C.t1,fontSize:13,fontWeight:500}}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// FX reference needed in PlansEditor
const FX:Record<string,number>={USD:1,AUD:1.55,NZD:1.65,GBP:0.78,EUR:0.92}
