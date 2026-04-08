// src/lib/limits.ts
// Plan limit definitions and enforcement helpers

import prisma from './db/client'

// ── Default limits per plan ───────────────────────────────────────────────────
export const PLAN_DEFAULTS: Record<string, { maxUsers: number; maxBatches: number }> = {
  trial:        { maxUsers: 3,   maxBatches: 20 },
  starter:      { maxUsers: 10,  maxBatches: 200 },
  professional: { maxUsers: 50,  maxBatches: 2000 },
  enterprise:   { maxUsers: 200, maxBatches: 999999 },
}

// ── Get effective limits for an org (DB plan > org overrides > defaults) ──────
export async function getOrgLimits(orgId: string): Promise<{ maxUsers: number; maxBatches: number; plan: string; orgName: string }> {
  const org = await prisma.org.findUnique({
    where: { id: orgId },
    select: { plan: true, maxUsers: true, maxBatches: true, name: true },
  })
  if (!org) return { maxUsers: 3, maxBatches: 20, plan: 'trial', orgName: '' }

  // Try to get plan limits from DB (if plan was seeded)
  try {
    const plan = await prisma.plan.findUnique({
      where: { code: org.plan },
      select: { maxUsers: true, maxBatches: true },
    })
    if (plan) {
      // Org-level overrides win if they're MORE restrictive or if explicitly set above plan defaults
      return {
        maxUsers: org.maxUsers,    // org.maxUsers is always the effective limit (set from plan on signup or overridden by admin)
        maxBatches: org.maxBatches,
        plan: org.plan,
        orgName: org.name,
      }
    }
  } catch {}

  // Fall back to org fields
  return {
    maxUsers: org.maxUsers,
    maxBatches: org.maxBatches,
    plan: org.plan,
    orgName: org.name,
  }
}

// ── Check if user limit reached ───────────────────────────────────────────────
export async function checkUserLimit(orgId: string): Promise<string | null> {
  const { maxUsers, plan, orgName } = await getOrgLimits(orgId)
  const count = await prisma.user.count({ where: { orgId, status: { not: 'suspended' } } })
  if (count >= maxUsers) {
    return `User limit reached (${count}/${maxUsers} on ${plan} plan). Upgrade to add more users.`
  }
  return null
}

// ── Check if batch limit reached (rolling 30 days) ───────────────────────────
export async function checkBatchLimit(orgId: string): Promise<string | null> {
  const { maxBatches, plan } = await getOrgLimits(orgId)
  if (maxBatches >= 999999) return null // unlimited

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const count = await prisma.batchSession.count({
    where: { orgId, startedAt: { gte: since } },
  })

  if (count >= maxBatches) {
    return `Batch session limit reached (${count}/${maxBatches} in last 30 days on ${plan} plan). Upgrade to run more sessions.`
  }
  return null
}

// ── Get current usage stats for an org ───────────────────────────────────────
export async function getOrgUsage(orgId: string) {
  const limits = await getOrgLimits(orgId)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [userCount, batchCount30d, totalBatches, totalAllocations] = await Promise.all([
    prisma.user.count({ where: { orgId, status: { not: 'suspended' } } }),
    prisma.batchSession.count({ where: { orgId, startedAt: { gte: since } } }),
    prisma.batchSession.count({ where: { orgId } }),
    prisma.allocation.count({ where: { orgId } }),
  ])

  return {
    users: { count: userCount, limit: limits.maxUsers, pct: Math.round(userCount / limits.maxUsers * 100) },
    batches: { count: batchCount30d, limit: limits.maxBatches, pct: limits.maxBatches >= 999999 ? 0 : Math.round(batchCount30d / limits.maxBatches * 100) },
    totals: { batches: totalBatches, allocations: totalAllocations },
    plan: limits.plan,
  }
}
