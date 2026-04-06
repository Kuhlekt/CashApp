// src/app/api/export/route.ts
// GDPR data export — full org data as JSON

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'superadmin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'full'
  const orgId = session.user.role === 'superadmin'
    ? (searchParams.get('orgId') ?? session.user.orgId)
    : session.user.orgId

  const [org, users, accounts, openItems, allocations, auditLogs, batchSessions] = await Promise.all([
    prisma.org.findUnique({ where: { id: orgId }, select: { id: true, name: true, slug: true, plan: true, status: true, createdAt: true } }),
    prisma.user.findMany({ where: { orgId }, select: { id: true, email: true, name: true, role: true, level: true, status: true, createdAt: true, lastLoginAt: true } }),
    type === 'full' ? prisma.account.findMany({ where: { orgId }, take: 10000 }) : [],
    type === 'full' ? prisma.openItem.findMany({ where: { orgId }, take: 10000 }) : [],
    type === 'full' ? prisma.allocation.findMany({ where: { orgId }, take: 10000 }) : [],
    prisma.auditLog.findMany({ where: { orgId }, orderBy: { timestamp: 'desc' }, take: 10000, select: { id: true, category: true, event: true, message: true, actor: true, timestamp: true, hash: true } }),
    prisma.batchSession.findMany({ where: { orgId }, orderBy: { startedAt: 'desc' }, take: 1000 }),
  ])

  const exportData = {
    exportedAt: new Date().toISOString(),
    exportedBy: session.user.email,
    type,
    org,
    users,
    ...(type === 'full' ? { accounts, openItems, allocations } : {}),
    batchSessions,
    auditLogs,
  }

  const filename = `cashflow-export-${org?.slug ?? orgId}-${new Date().toISOString().slice(0, 10)}.json`

  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

// DELETE — right to erasure (GDPR Article 17)
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { orgId, confirm } = body

  if (!orgId || confirm !== 'DELETE_ALL_DATA') {
    return NextResponse.json({ error: 'Provide orgId and confirm="DELETE_ALL_DATA"' }, { status: 400 })
  }

  // Delete all org data in order (cascade handles most)
  await prisma.org.delete({ where: { id: orgId } })

  return NextResponse.json({ ok: true, message: `Org ${orgId} and all data permanently deleted` })
}
