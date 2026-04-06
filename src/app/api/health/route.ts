// src/app/api/health/route.ts
import { NextResponse } from 'next/server'
import prisma from '../../../lib/db/client'

export async function GET() {
  const checks = { db: false, app: true, timestamp: new Date().toISOString(), version: process.env.npm_package_version ?? '1.0.0' }

  try {
    await prisma.$queryRaw`SELECT 1`
    checks.db = true
  } catch (err) {
    console.error('DB health check failed:', err)
  }

  const healthy = checks.db && checks.app
  return NextResponse.json(checks, { status: healthy ? 200 : 503 })
}
