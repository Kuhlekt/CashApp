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
    const [totalOrgs, totalUsers, totalBatches, totalAllocations, activeOrgs, trialOrgs, mrrAgg] = await Promise.all([
      prisma.org.count(),
      prisma.user.count(),
      prisma.batchSession.count(),
      prisma.allocation.count(),
      prisma.org.count({ where: { status: 'active' } }),
      prisma.org.count({ where: { status: 'trial' } }),
      prisma.org.aggregate({ _sum: { mrr: true } }),
    ])
    const recentOrgs = await prisma.org.findMany({
      orderBy: { createdAt: 'desc' }, take: 10,
      include: { _count: { select: { users: true, sessions: true, accounts: true } } },
    })
    return NextResponse.json({
      stats: { orgs: totalOrgs, users: totalUsers, batches: totalBatches, allocations: totalAllocations, activeOrgs, trialOrgs, mrr: mrrAgg._sum.mrr ?? 0 },
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
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }, take: 200,
      include: { org: { select: { name: true, slug: true } } },
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
    // Try DB plans first, fall back gracefully
    try {
      const plans = await prisma.plan.findMany({
        where: { active: true }, orderBy: { sortOrder: 'asc' },
        include: { prices: { where: { active: true }, orderBy: [{ currency: 'asc' }, { interval: 'asc' }] } },
      })
      return NextResponse.json({ plans })
    } catch {
      return NextResponse.json({ plans: [] })
    }
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

    // Validate required fields
    if (!code?.trim()) return NextResponse.json({ error: 'Promo code is required' }, { status: 400 })
    if (!discountValue || discountValue <= 0) return NextResponse.json({ error: 'Discount value must be greater than 0' }, { status: 400 })

    const codeUpper = code.trim().toUpperCase()

    try {
      const promo = await prisma.promoCode.upsert({
        where: { code: codeUpper },
        update: {
          discountType: discountType ?? 'percent',
          discountValue: parseInt(discountValue),
          maxRedemptions: maxRedemptions ? parseInt(maxRedemptions) : null,
          validUntil: validUntil ? new Date(validUntil) : null,
          planCodes: planCodes ?? [],
          active: active !== false,
        },
        create: {
          code: codeUpper,
          discountType: discountType ?? 'percent',
          discountValue: parseInt(discountValue),
          maxRedemptions: maxRedemptions ? parseInt(maxRedemptions) : null,
          validUntil: validUntil ? new Date(validUntil) : null,
          planCodes: planCodes ?? [],
          active: active !== false,
        },
      })
      return NextResponse.json({ ok: true, promo })
    } catch (err) {
      return NextResponse.json({ error: 'Failed to save promo: ' + (err as Error).message }, { status: 500 })
    }
  }

  if (action === 'toggle-promo') {
    const { id, active } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const promo = await prisma.promoCode.update({ where: { id }, data: { active: !!active } })
    return NextResponse.json({ ok: true, promo })
  }

  if (action === 'test-email') {
    return NextResponse.json({ ok: true, message: 'Test email triggered — configure CLICKSEND_* env vars to send' })
  }

  if (action === 'suspend-user') {
    const { userId } = body
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
    const user = await prisma.user.update({ where: { id: userId }, data: { status: 'suspended' } })
    return NextResponse.json({ ok: true, user })
  }

  if (action === 'unlock-user') {
    const { userId } = body
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
    const user = await prisma.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: null, status: 'active' } })
    return NextResponse.json({ ok: true, user })
  }

  return NextResponse.json({ error: 'Unknown action: ' + action }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(session.user.role)) return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { orgId, extendTrial, plan, status, mrr, maxUsers, maxBatches } = body

  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  // Extend trial
  if (extendTrial) {
    const org = await prisma.org.findUnique({ where: { id: orgId }, select: { trialEndsAt: true } })
    const base = org?.trialEndsAt && org.trialEndsAt > new Date() ? org.trialEndsAt : new Date()
    const newEnd = new Date(base.getTime() + parseInt(extendTrial) * 86400000)
    const updated = await prisma.org.update({
      where: { id: orgId },
      data: { trialEndsAt: newEnd, status: 'trial' },
    })
    return NextResponse.json(updated)
  }

  // Update org fields
  const updateData: Record<string, unknown> = {}
  if (plan !== undefined) updateData.plan = plan
  if (status !== undefined) updateData.status = status
  if (mrr !== undefined) updateData.mrr = parseInt(mrr) || 0
  if (maxUsers !== undefined) updateData.maxUsers = parseInt(maxUsers) || 3
  if (maxBatches !== undefined) updateData.maxBatches = parseInt(maxBatches) || 20

  const updated = await prisma.org.update({ where: { id: orgId }, data: updateData })
  return NextResponse.json(updated)
}
