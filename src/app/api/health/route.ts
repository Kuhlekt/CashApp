// src/app/api/health/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {}
  const start = Date.now()

  // Database check
  try {
    const { default: prisma } = await import('../../../lib/db/client')
    const dbStart = Date.now()
    await prisma.$queryRaw`SELECT 1`
    checks.database = { ok: true, ms: Date.now() - dbStart }
  } catch (err) {
    checks.database = { ok: false, error: (err as Error).message }
  }

  // Anthropic key check
  checks.anthropic = { ok: !!process.env.ANTHROPIC_API_KEY }

  // ClickSend check
  checks.clicksend = { ok: !!(process.env.CLICKSEND_USERNAME && process.env.CLICKSEND_API_KEY) }

  // Stripe check
  checks.stripe = { ok: !!process.env.STRIPE_SECRET_KEY }

  const allOk = Object.values(checks).every(c => c.ok)

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    version: '1.0.0',
    uptime: process.uptime(),
    totalMs: Date.now() - start,
    checks,
    env: process.env.NODE_ENV,
    region: process.env.VERCEL_REGION ?? 'local',
  }, { status: allOk ? 200 : 503 })
}
