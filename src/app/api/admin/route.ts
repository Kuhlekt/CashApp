// src/app/api/admin/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'

function isSuperAdmin(role: string) { return role === 'superadmin' }

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(session.user.role)) return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') ?? 'overview'

  if (view === 'overview') {
    const [orgs, users, batches, allocations, activeOrgs, trialOrgs, mrrAgg] = await Promise.all([
      prisma.org.count(), prisma.user.count(), prisma.batchSession.count(), prisma.allocation.count(),
      prisma.org.count({ where: { status: 'active' } }),
      prisma.org.count({ where: { status: 'trial' } }),
      prisma.org.aggregate({ _sum: { mrr: true } }),
    ])
    const recentOrgs = await prisma.org.findMany({
      orderBy: { createdAt: 'desc' }, take: 10,
      include: { _count: { select: { users: true, sessions: true, accounts: true } } },
    })
    return NextResponse.json({ stats: { orgs, users, batches, allocations, activeOrgs, trialOrgs, mrr: mrrAgg._sum.mrr ?? 0 }, recentOrgs })
  }

  if (view === 'orgs') {
    const orgs = await prisma.org.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, sessions: true, accounts: true } } },
    })
    return NextResponse.json({ orgs })
  }

  if (view === 'users') {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }, take: 200,
      include: { org: { select: { name: true, slug: true } } },
      select: { id: true, email: true, name: true, role: true, level: true, status: true, lastLoginAt: true, createdAt: true, failedLogins: true, lockedUntil: true, org: true },
    })
    return NextResponse.json({ users })
  }

  if (view === 'audit') {
    const logs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' }, take: 200,
      include: { org: { select: { name: true } } },
    })
    return NextResponse.json({ logs })
  }

  if (view === 'promos') {
    const promos = await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ promos })
  }

  if (view === 'plans') {
    const plans = await prisma.plan.findMany({
      where: { active: true }, orderBy: { sortOrder: 'asc' },
      include: { prices: { where: { active: true }, orderBy: [{ currency: 'asc' }, { interval: 'asc' }] } },
    })
    return NextResponse.json({ plans })
  }

  return NextResponse.json({ error: 'Unknown view' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(session.user.role)) return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { action } = body

  if (action === 'save-promo') {
    const { code, discountType, discountValue, maxRedemptions, validUntil, planCodes, active } = body
    if (!code || !discountValue) return NextResponse.json({ error: 'code and discountValue required' }, { status: 400 })
    const promo = await prisma.promoCode.upsert({
      where: { code: code.toUpperCase() },
      update: { discountType, discountValue, maxRedemptions: maxRedemptions || null, validUntil: validUntil ? new Date(validUntil) : null, planCodes: planCodes ?? [], active: active ?? true },
      create: { code: code.toUpperCase(), discountType, discountValue, maxRedemptions: maxRedemptions || null, validUntil: validUntil ? new Date(validUntil) : null, planCodes: planCodes ?? [], active: active ?? true },
    })
    return NextResponse.json({ promo })
  }

  if (action === 'toggle-promo') {
    const { id, active } = body
    const promo = await prisma.promoCode.update({ where: { id }, data: { active } })
    return NextResponse.json({ promo })
  }

  if (action === 'test-email') {
    const { orgId } = body
    // Log the test attempt
    return NextResponse.json({ ok: true, message: 'Test email triggered (configure ClickSend env vars to send)' })
  }

  if (action === 'suspend-user') {
    const { userId } = body
    const user = await prisma.user.update({ where: { id: userId }, data: { status: 'suspended' } })
    return NextResponse.json({ user })
  }

  if (action === 'unlock-user') {
    const { userId } = body
    const user = await prisma.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: null, status: 'active' } })
    return NextResponse.json({ user })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(session.user.role)) return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { orgId, extendTrial, ...updateData } = body
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  if (extendTrial) {
    const org = await prisma.org.findUnique({ where: { id: orgId }, select: { trialEndsAt: true } })
    const base = org?.trialEndsAt && org.trialEndsAt > new Date() ? org.trialEndsAt : new Date()
    const newEnd = new Date(base.getTime() + extendTrial * 86400000)
    const updated = await prisma.org.update({ where: { id: orgId }, data: { trialEndsAt: newEnd, status: 'trial' } })
    return NextResponse.json(updated)
  }

  const { plan, status, mrr, maxUsers, maxBatches } = updateData
  const updated = await prisma.org.update({
    where: { id: orgId },
    data: {
      ...(plan !== undefined ? { plan } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(mrr !== undefined ? { mrr: parseInt(mrr) } : {}),
      ...(maxUsers !== undefined ? { maxUsers: parseInt(maxUsers) } : {}),
      ...(maxBatches !== undefined ? { maxBatches: parseInt(maxBatches) } : {}),
    },
  })
  return NextResponse.json(updated)
}
