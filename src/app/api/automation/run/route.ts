// src/app/api/automation/run/route.ts
// POST /api/automation/run — trigger automation pipeline
// Called by: UI manual run, Railway cron, GitHub Actions

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../lib/auth/config'
import { runAutomationPipeline } from '../../../../lib/automation/engine'

export const maxDuration = 300 // 5 min Vercel timeout (Pro plan)

export async function POST(req: NextRequest) {
  // Allow cron secret for Railway/GitHub Actions calls
  const cronSecret = req.headers.get('x-cron-secret')
  const isScheduled = cronSecret === process.env.CRON_SECRET

  let orgId: string
  let trigger: 'manual' | 'scheduled' | 'api' = 'api'

  if (isScheduled) {
    // Scheduled run — orgId from body
    const body = await req.json().catch(() => ({}))
    orgId = body.orgId
    trigger = 'scheduled'
    if (!orgId) {
      return NextResponse.json({ error: 'orgId required for scheduled runs' }, { status: 400 })
    }
  } else {
    // User-initiated — get orgId from session
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    orgId = session.user.orgId
    trigger = 'manual'

    // Check role — only L3+ can trigger automation
    if (!['L3', 'L4'].includes(session.user.level)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
  }

  try {
    const result = await runAutomationPipeline(orgId, trigger)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Pipeline failed'
    console.error('Automation run error:', error)
    return NextResponse.json({ success: false, error }, { status: 500 })
  }
}

// GET — check automation status
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prisma } = await import('../../../../lib/db/client')
  const [cfg, lastRun, runningCount] = await Promise.all([
    prisma.automationConfig.findUnique({ where: { orgId: session.user.orgId } }),
    prisma.automationRun.findFirst({ where: { orgId: session.user.orgId }, orderBy: { startedAt: 'desc' } }),
    prisma.automationRun.count({ where: { orgId: session.user.orgId, status: 'running' } }),
  ])

  return NextResponse.json({ cfg, lastRun, isRunning: runningCount > 0 })
}
