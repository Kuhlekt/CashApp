// src/app/api/audit/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'
import { verifyAuditChain } from '../../../lib/db/audit'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')
  const event = searchParams.get('event')
  const category = searchParams.get('category')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const verify = searchParams.get('verify') === 'true'
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500)

  const logs = await prisma.auditLog.findMany({
    where: {
      orgId: session.user.orgId,
      ...(sessionId ? { sessionId } : {}),
      ...(event ? { event: { contains: event, mode: 'insensitive' } } : {}),
      ...(category ? { category } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
    include: { user: { select: { name: true, email: true } } },
  })

  const total = await prisma.auditLog.count({ where: { orgId: session.user.orgId } })

  let chainVerification = null
  if (verify) {
    chainVerification = await verifyAuditChain(session.user.orgId)
  }

  return NextResponse.json({ logs, total, page, pages: Math.ceil(total / limit), chainVerification })
}

// Export audit log
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!['L3', 'L4'].includes(session.user.level)) {
    return NextResponse.json({ error: 'L3+ required to export audit log' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { sessionId, format = 'json' } = body

  const logs = await prisma.auditLog.findMany({
    where: { orgId: session.user.orgId, ...(sessionId ? { sessionId } : {}) },
    orderBy: { createdAt: 'asc' },
  })

  if (format === 'csv') {
    const header = 'timestamp,category,event,message,actor,session_id,chain_hash\n'
    const rows = logs.map(l =>
      `"${l.createdAt.toISOString()}","${l.category}","${l.event}","${l.message.replace(/"/g, '""')}","${l.actor}","${l.sessionId ?? ''}","${l.chainHash}"`
    ).join('\n')
    return new NextResponse(header + rows, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit-${session.user.orgId}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  return NextResponse.json({ logs, exportedAt: new Date().toISOString(), totalEvents: logs.length })
}
