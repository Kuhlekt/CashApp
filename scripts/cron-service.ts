// scripts/cron-service.ts
// Railway Cron Service — runs as a persistent process on Railway
// Checks all org schedules every minute and triggers automation runs
// Deploy: railway up --service cashflow-cron

import cron from 'node-cron'
import axios from 'axios'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET ?? ''

console.log('🕐 CashFlow Automation Scheduler starting...')
console.log(`   App URL: ${APP_URL}`)
console.log(`   Time: ${new Date().toISOString()}`)

// ─── CHECK ALL ORG SCHEDULES EVERY MINUTE ────────────────────────────────────
cron.schedule('* * * * *', async () => {
  const now = new Date()
  console.log(`[${now.toISOString()}] Checking schedules...`)

  try {
    // Get all orgs with active automation
    const response = await axios.get(`${APP_URL}/api/automation/scheduled`, {
      headers: { 'x-cron-secret': CRON_SECRET },
      timeout: 10000,
    })

    const { orgs } = response.data as { orgs: Array<{ orgId: string; runTime: string; timezone: string; frequency: string }> }

    for (const org of orgs) {
      if (shouldRunNow(org, now)) {
        console.log(`[${now.toISOString()}] Triggering run for org: ${org.orgId}`)
        triggerRun(org.orgId).catch(err => {
          console.error(`Failed to trigger run for org ${org.orgId}:`, err.message)
        })
      }
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error(`Schedule check failed: ${err.message}`)
    }
  }
}, { timezone: 'UTC' })

function shouldRunNow(org: { runTime: string; timezone: string; frequency: string }, now: Date): boolean {
  // Convert 'now' to org's timezone for comparison
  const orgTime = new Date(now.toLocaleString('en-US', { timeZone: org.timezone }))
  const [h, m] = org.runTime.split(':').map(Number)

  if (orgTime.getHours() !== h || orgTime.getMinutes() !== m) return false

  const day = orgTime.getDay()
  if (org.frequency === 'weekdays' && (day === 0 || day === 6)) return false
  if (org.frequency === 'weekly' && day !== 1) return false // Monday

  return true
}

async function triggerRun(orgId: string): Promise<void> {
  await axios.post(
    `${APP_URL}/api/automation/run`,
    { orgId, trigger: 'scheduled' },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
      timeout: 300000, // 5 min
    }
  )
}

// ─── DAILY SUMMARY (6am UTC) ─────────────────────────────────────────────────
cron.schedule('0 6 * * *', async () => {
  console.log(`[${new Date().toISOString()}] Sending daily summaries...`)

  try {
    await axios.post(
      `${APP_URL}/api/notifications/daily-summary`,
      {},
      { headers: { 'x-cron-secret': CRON_SECRET }, timeout: 60000 }
    )
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error('Daily summary failed:', err.message)
    }
  }
}, { timezone: 'UTC' })

// ─── AGING ALERTS (Monday 8am UTC) ───────────────────────────────────────────
cron.schedule('0 8 * * 1', async () => {
  console.log(`[${new Date().toISOString()}] Sending aging alerts...`)
  try {
    await axios.post(
      `${APP_URL}/api/notifications/aging-alert`,
      {},
      { headers: { 'x-cron-secret': CRON_SECRET }, timeout: 60000 }
    )
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error('Aging alert failed:', err.message)
    }
  }
}, { timezone: 'UTC' })

console.log('✅ Scheduler running. Ctrl+C to stop.')

// Keep process alive
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down scheduler')
  process.exit(0)
})
