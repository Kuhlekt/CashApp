// src/app/api/automation/scheduled/route.ts
// Called by Railway cron service every minute
// Returns orgs that have automation enabled + their schedule config

import { NextRequest, NextResponse } from 'next/server'
import prisma from '../../../../lib/db/client'

export async function GET(req: NextRequest) {
  // Validate cron secret
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const enabledCfgs = await prisma.automationConfig.findMany({
    where: { enabled: true },
    select: {
      orgId: true,
      runTime: true,
      timezone: true,
      frequency: true,
      cronExpression: true,
    },
  })

  return NextResponse.json({ orgs: enabledCfgs, checkedAt: new Date().toISOString() })
}

// POST — check-all-schedules action from GitHub Actions cron
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { orgId: specificOrgId, force } = body

  const enabledCfgs = await prisma.automationConfig.findMany({
    where: {
      enabled: true,
      ...(specificOrgId ? { orgId: specificOrgId } : {}),
    },
    select: {
      orgId: true,
      runTime: true,
      timezone: true,
      frequency: true,
    },
  })

  const now = new Date()
  const results: Array<{ orgId: string; triggered: boolean; reason: string }> = []

  for (const cfg of enabledCfgs) {
    const orgTime = new Date(now.toLocaleString('en-US', { timeZone: cfg.timezone }))
    const [h, m] = cfg.runTime.split(':').map(Number)
    const isTime = orgTime.getHours() === h && orgTime.getMinutes() === m
    const day = orgTime.getDay()
    const isWeekday = day >= 1 && day <= 5

    const shouldRun = force === 'true' || (
      isTime &&
      (cfg.frequency === 'daily' ||
       (cfg.frequency === 'weekdays' && isWeekday) ||
       (cfg.frequency === 'weekly' && day === 1))
    )

    if (shouldRun) {
      // Trigger async — don't await
      fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/automation/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret ?? '' },
        body: JSON.stringify({ orgId: cfg.orgId, trigger: 'scheduled' }),
      }).catch(console.error)

      results.push({ orgId: cfg.orgId, triggered: true, reason: force === 'true' ? 'forced' : 'schedule match' })
    } else {
      results.push({ orgId: cfg.orgId, triggered: false, reason: isTime ? 'day filter' : 'not scheduled time' })
    }
  }

  return NextResponse.json({ results, checkedAt: now.toISOString() }, { status: results.some(r => r.triggered) ? 200 : 207 })
}
