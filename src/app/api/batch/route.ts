// src/app/api/batch/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'
import { auditLog } from '../../../lib/db/audit'
import { checkBatchLimit, getOrgUsage } from '../../../lib/limits'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const view   = searchParams.get('view')
  const status = searchParams.get('status')
  const limit  = parseInt(searchParams.get('limit') ?? '20')

  // Usage stats view
  if (view === 'usage') {
    const usage = await getOrgUsage(session.user.orgId)
    return NextResponse.json(usage)
  }

  const sessions = await prisma.batchSession.findMany({
    where: { orgId: session.user.orgId, ...(status ? { status } : {}) },
    orderBy: { startedAt: 'desc' },
    take: Math.min(limit, 100),
    include: { _count: { select: { allocations: true } } },
  })

  return NextResponse.json(sessions)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { action, sessionId } = body

  if (action === 'suspend' && sessionId) {
    const reason = body.reason ?? 'Manual suspend'
    const updated = await prisma.batchSession.update({
      where: { id: sessionId, orgId: session.user.orgId },
      data: { status: 'suspended', suspendedAt: new Date(), suspendReason: reason },
    })
    await auditLog({ orgId: session.user.orgId, sessionId, userId: session.user.id, category: 'user', event: 'BATCH_SUSPENDED', message: `Batch suspended: ${reason}`, actor: session.user.name })
    return NextResponse.json(updated)
  }

  if (action === 'resume' && sessionId) {
    const updated = await prisma.batchSession.update({
      where: { id: sessionId, orgId: session.user.orgId },
      data: { status: 'open', suspendedAt: null, suspendReason: null },
    })
    await auditLog({ orgId: session.user.orgId, sessionId, userId: session.user.id, category: 'user', event: 'BATCH_RESUMED', message: 'Batch resumed', actor: session.user.name })
    return NextResponse.json(updated)
  }

  if (action === 'create' || !action) {
    // ── Enforce batch limit ──────────────────────────────────────────────────
    const limitError = await checkBatchLimit(session.user.orgId)
    if (limitError) return NextResponse.json({ error: limitError }, { status: 403 })

    const sessionRef = `SESS-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`
    const newSession = await prisma.batchSession.create({
      data: {
        orgId: session.user.orgId,
        sessionRef,
        status: 'open',
        trigger: body.trigger ?? 'manual',
        userId: session.user.id,
        region: body.region,
      },
    })
    await auditLog({ orgId: session.user.orgId, sessionId: newSession.id, userId: session.user.id, category: 'system', event: 'BATCH_CREATED', message: `New batch session: ${sessionRef}`, actor: session.user.name })
    return NextResponse.json(newSession, { status: 201 })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
