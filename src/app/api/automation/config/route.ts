// src/app/api/automation/config/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../lib/auth/config'
import prisma from '../../../../lib/db/client'
import { auditLog } from '../../../../lib/db/audit'
import { z } from 'zod'

const configSchema = z.object({
  enabled: z.boolean().optional(),
  frequency: z.enum(['daily', 'weekly', 'weekdays', 'custom']).optional(),
  runTime: z.string().optional(),
  timezone: z.string().optional(),
  cronExpression: z.string().optional(),
  batchOpenAction: z.enum(['suspend', 'clear', 'skip', 'complete']).optional(),
  timeoutMin: z.number().int().min(1).max(480).optional(),
  bankSrcType: z.string().optional(),
  bankSrcUrl: z.string().optional(),
  bankSrcAuth: z.string().optional(),
  bankSrcFormat: z.string().optional(),
  bankSrcPattern: z.string().optional(),
  bankSrcPath: z.string().optional(),
  bankSrcUser: z.string().optional(),
  debtorSrcType: z.string().optional(),
  debtorSrcUrl: z.string().optional(),
  debtorSrcAuth: z.string().optional(),
  debtorSrcFormat: z.string().optional(),
  debtorSrcRefresh: z.string().optional(),
  debtorSrcPath: z.string().optional(),
  outputFormat: z.string().optional(),
  outputFilename: z.string().optional(),
  outputDestType: z.string().optional(),
  outputDestUrl: z.string().optional(),
  outputDestUser: z.string().optional(),
  outputLocalCopy: z.boolean().optional(),
  mlAutoThresh: z.number().min(0.5).max(1).optional(),
  mlAiThresh: z.number().min(0.3).max(1).optional(),
  aiEnabled: z.boolean().optional(),
  aiModel: z.string().optional(),
  aiMaxCallsPerRun: z.number().int().min(1).max(5000).optional(),
  haltAtExceptions: z.boolean().optional(),
  autoApprove: z.boolean().optional(),
  autoOutput: z.boolean().optional(),
  notifyOnComplete: z.boolean().optional(),
  pickupOffsetMin: z.number().int().optional(),
  retryEnabled: z.boolean().optional(),
  retryCount: z.number().int().min(1).max(10).optional(),
  retryIntervalMin: z.number().int().min(1).max(60).optional(),
  alertOnSkip: z.boolean().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cfg = await prisma.automationConfig.findUnique({
    where: { orgId: session.user.orgId },
  })

  const regions = await prisma.region.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { code: 'asc' },
  })

  const runHistory = await prisma.automationRun.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { startedAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({ cfg, regions, runHistory })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!['L3', 'L4'].includes(session.user.level)) {
    return NextResponse.json({ error: 'Insufficient permissions — L3 or higher required' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = configSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
  }

  const cfg = await prisma.automationConfig.upsert({
    where: { orgId: session.user.orgId },
    create: { orgId: session.user.orgId, ...parsed.data },
    update: parsed.data,
  })

  await auditLog({
    orgId: session.user.orgId,
    userId: session.user.id,
    category: 'user',
    event: 'AUTO_CFG_UPDATED',
    message: `Automation config updated. Enabled: ${cfg.enabled}, Freq: ${cfg.frequency} ${cfg.runTime} ${cfg.timezone}`,
    actor: session.user.name,
    metadata: { enabled: cfg.enabled, frequency: cfg.frequency, runTime: cfg.runTime },
  })

  return NextResponse.json({ success: true, cfg })
}
