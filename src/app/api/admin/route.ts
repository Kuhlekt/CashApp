// src/app/api/admin/route.ts
// Super admin — cross-org visibility, platform management

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'

function requireSuperAdmin(role: string) {
  if (role !== 'superadmin') throw new Error('Forbidden')
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { requireSuperAdmin(session.user.role) } catch {
    return NextResponse.json({ error: 'Forbidden — superadmin only' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') ?? 'overview'

  if (view === 'overview') {
    const [orgs, users, batches, allocations] = await Promise.all([
      prisma.org.count(),
      prisma.user.count(),
      prisma.batchSession.count(),
      prisma.allocation.count(),
    ])

    const activeOrgs = await prisma.org.count({ where: { status: 'active' } })
    const trialOrgs  = await prisma.org.count({ where: { status: 'trial' } })
    const mrrTotal   = await prisma.org.aggregate({ _sum: { mrr: true } })

    const recentOrgs = await prisma.org.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, name: true, slug: true, plan: true, status: true, mrr: true, createdAt: true, trialEndsAt: true, _count: { select: { users: true } } },
    })

    return NextResponse.json({
      stats: { orgs, users, batches, allocations, activeOrgs, trialOrgs, mrr: mrrTotal._sum.mrr ?? 0 },
      recentOrgs,
    })
  }

  if (view === 'orgs') {
    const orgs = await prisma.org.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, sessions: true, accounts: true } } },
    })
    return NextResponse.json({ orgs })
  }

  if (view === 'users') {
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = 50
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { org: { select: { name: true, slug: true } } },
    })
    const total = await prisma.user.count()
    return NextResponse.json({ users, total, page, pages: Math.ceil(total / limit) })
  }

  if (view === 'audit') {
    const logs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100,
      include: { org: { select: { name: true } } },
    })
    return NextResponse.json({ logs })
  }

  return NextResponse.json({ error: 'Unknown view' }, { status: 400 })
}

// PATCH — update org plan/status/mrr
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { requireSuperAdmin(session.user.role) } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { orgId, plan, status, mrr, maxUsers, maxBatches } = body
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  const updated = await prisma.org.update({
    where: { id: orgId },
    data: {
      ...(plan ? { plan } : {}),
      ...(status ? { status } : {}),
      ...(mrr !== undefined ? { mrr } : {}),
      ...(maxUsers ? { maxUsers } : {}),
      ...(maxBatches ? { maxBatches } : {}),
    },
  })

  return NextResponse.json(updated)
}
