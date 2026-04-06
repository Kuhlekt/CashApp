// src/lib/security/rateLimit.ts

import prisma from '../db/client'

interface RateLimitOptions {
  key: string
  limit: number
  windowMs: number
}

export async function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + windowMs)
  try {
    await prisma.rateLimit.deleteMany({ where: { windowEnd: { lt: now } } })
    const record = await prisma.rateLimit.upsert({
      where: { key },
      update: { count: { increment: 1 } },
      create: { key, count: 1, windowEnd },
    })
    return { allowed: record.count <= limit, remaining: Math.max(0, limit - record.count), resetAt: record.windowEnd }
  } catch {
    return { allowed: true, remaining: limit, resetAt: windowEnd }
  }
}

export const RATE_LIMITS = {
  login:         { limit: 5,   windowMs: 15 * 60 * 1000 },
  api:           { limit: 100, windowMs: 60 * 1000 },
  invite:        { limit: 10,  windowMs: 60 * 60 * 1000 },
  passwordReset: { limit: 3,   windowMs: 60 * 60 * 1000 },
  claude:        { limit: 50,  windowMs: 60 * 60 * 1000 },
}
