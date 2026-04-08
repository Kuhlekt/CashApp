// src/app/api/admin/route.ts — Build b20260408-001
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'

function isSA(role: string) { return role === 'superadmin' }

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSA(session.user.role)) return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })

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
      include: { _count: { select: { users: true, sessions: true } } },
    })
    return NextResponse.json({
      stats: { orgs: totalOrgs, users: totalUsers, batches: totalBatches, allocations: totalAllocations, activeOrgs, trialOrgs, mrr: mrrAgg._sum.mrr ?? 0 },
      recentOrgs,
    })
  }

  if (view === 'orgs') {
    // Include current month session count + user count for usage monitoring
    const orgs = await prisma.org.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, sessions: true } } },
    })

    // Get this month's session counts per org
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const monthSessions = await prisma.batchSession.groupBy({
      by: ['orgId'],
      where: { startedAt: { gte: monthStart } },
      _count: { id: true },
    })
    const sessionMap = Object.fromEntries(monthSessions.map(s => [s.orgId, s._count.id]))

    const orgsWithUsage = orgs.map(org => ({
      ...org,
      monthSessions: sessionMap[org.id] ?? 0,
    }))

    return NextResponse.json({ orgs: orgsWithUsage })
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

  if (view === 'usage') {
    // Real-time usage monitoring across all orgs
    const orgs = await prisma.org.findMany({
      select: {
        id: true, name: true, slug: true, plan: true, status: true,
        maxUsers: true, maxBatches: true,
        _count: {
          select: {
            users: { where: { status: 'active' } },
            sessions: true,
            accounts: true,
            openItems: true,
            allocations: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Get current month session counts per org
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const monthlySessionCounts = await prisma.batchSession.groupBy({
      by: ['orgId'],
      where: { startedAt: { gte: startOfMonth } },
      _count: { id: true }
    })
    const monthMap = Object.fromEntries(monthlySessionCounts.map(r => [r.orgId, r._count.id]))

    const usage = orgs.map(org => ({
      ...org,
      monthlyRuns: monthMap[org.id] ?? 0,
      userPct: org.maxUsers > 0 ? Math.round((org._count.users / org.maxUsers) * 100) : 0,
      batchPct: org.maxBatches < 999999 ? Math.round(((monthMap[org.id] ?? 0) / org.maxBatches) * 100) : 0,
    }))

    return NextResponse.json({ usage })
  }

  if (view === 'usage') {
    // Cross-org usage monitoring
    const orgs = await prisma.org.findMany({
      select: { id: true, name: true, slug: true, plan: true, maxUsers: true, maxBatches: true },
      orderBy: { name: 'asc' },
    })
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const usageData = await Promise.all(orgs.map(async org => {
      const [userCount, batchCount] = await Promise.all([
        prisma.user.count({ where: { orgId: org.id, status: { not: 'suspended' } } }),
        prisma.batchSession.count({ where: { orgId: org.id, startedAt: { gte: monthStart } } }),
      ])
      return {
        ...org,
        usage: { users: userCount, batches: batchCount },
        userPct: org.maxUsers > 0 ? Math.round(userCount / org.maxUsers * 100) : 0,
        batchPct: org.maxBatches < 999999 ? Math.round(batchCount / org.maxBatches * 100) : 0,
      }
    }))
    return NextResponse.json({ usage: usageData })
  }

  if (view === 'plans') {
    try {
      const plans = await prisma.plan.findMany({
        where: { active: true }, orderBy: { sortOrder: 'asc' },
        include: { prices: { orderBy: [{ currency: 'asc' }, { interval: 'asc' }] } },
      })
      return NextResponse.json({ plans })
    } catch { return NextResponse.json({ plans: [] }) }
  }

  return NextResponse.json({ error: 'Unknown view' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSA(session.user.role)) return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { action } = body

  if (action === 'save-promo') {
    const { code, discountType, discountValue, maxRedemptions, validUntil, planCodes, active } = body
    if (!code?.trim()) return NextResponse.json({ error: 'Code required' }, { status: 400 })
    if (!discountValue || discountValue <= 0) return NextResponse.json({ error: 'Discount must be > 0' }, { status: 400 })
    try {
      const promo = await prisma.promoCode.upsert({
        where: { code: code.trim().toUpperCase() },
        update: { discountType: discountType ?? 'percent', discountValue: parseInt(discountValue), maxRedemptions: maxRedemptions ? parseInt(maxRedemptions) : null, validUntil: validUntil ? new Date(validUntil) : null, planCodes: planCodes ?? [], active: active !== false },
        create: { code: code.trim().toUpperCase(), discountType: discountType ?? 'percent', discountValue: parseInt(discountValue), maxRedemptions: maxRedemptions ? parseInt(maxRedemptions) : null, validUntil: validUntil ? new Date(validUntil) : null, planCodes: planCodes ?? [], active: active !== false },
      })
      return NextResponse.json({ ok: true, promo })
    } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
  }

  if (action === 'toggle-promo') {
    const { id, active } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const promo = await prisma.promoCode.update({ where: { id }, data: { active: !!active } })
    return NextResponse.json({ ok: true, promo })
  }

  if (action === 'update-org-limits') {
    const { orgId, maxUsers, maxBatches } = body
    if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })
    const org = await prisma.org.update({
      where: { id: orgId },
      data: { maxUsers: parseInt(maxUsers), maxBatches: parseInt(maxBatches) },
    })
    return NextResponse.json({ ok: true, org })
  }

  if (action === 'test-email') {
    return NextResponse.json({ ok: true, message: 'Configure CLICKSEND_* env vars to enable' })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSA(session.user.role)) return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { orgId, extendTrial, plan, status, mrr, maxUsers, maxBatches } = body
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  if (extendTrial) {
    const org = await prisma.org.findUnique({ where: { id: orgId }, select: { trialEndsAt: true } })
    const base = org?.trialEndsAt && org.trialEndsAt > new Date() ? org.trialEndsAt : new Date()
    const updated = await prisma.org.update({ where: { id: orgId }, data: { trialEndsAt: new Date(base.getTime() + parseInt(extendTrial) * 86400000), status: 'trial' } })
    return NextResponse.json(updated)
  }

  const data: Record<string, unknown> = {}
  if (plan !== undefined) data.plan = plan
  if (status !== undefined) data.status = status
  if (mrr !== undefined) data.mrr = parseInt(mrr) || 0
  if (maxUsers !== undefined) data.maxUsers = parseInt(maxUsers) || 3
  if (maxBatches !== undefined) data.maxBatches = parseInt(maxBatches) || 20
  const updated = await prisma.org.update({ where: { id: orgId }, data })
  return NextResponse.json(updated)
}
