// src/app/api/api-keys/route.ts
// Per-org API keys for third-party integrations

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'
import { createHash, randomBytes } from 'crypto'

function generateApiKey(): string {
  const prefix = 'cfa'
  const secret = randomBytes(32).toString('hex')
  return `${prefix}_${secret}`
}

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

// Store API keys in org settings JSON
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'superadmin'].includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const org = await prisma.org.findUnique({ where: { id: session.user.orgId }, select: { settings: true } })
  const settings = (org?.settings as Record<string, unknown>) ?? {}
  const keys = (settings.apiKeys as Array<{ id: string; name: string; prefix: string; createdAt: string; lastUsed?: string }>) ?? []

  return NextResponse.json({ keys })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'superadmin'].includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { name } = body
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const key = generateApiKey()
  const keyHash = hashApiKey(key)
  const keyRecord = {
    id: randomBytes(8).toString('hex'),
    name,
    prefix: key.slice(0, 12) + '...',
    hash: keyHash,
    createdAt: new Date().toISOString(),
    createdBy: session.user.email,
  }

  const org = await prisma.org.findUnique({ where: { id: session.user.orgId }, select: { settings: true } })
  const settings = (org?.settings as Record<string, unknown>) ?? {}
  const keys = [...((settings.apiKeys as unknown[]) ?? []), keyRecord]

  if (keys.length > 10) return NextResponse.json({ error: 'Maximum 10 API keys per org' }, { status: 400 })

  await prisma.org.update({
    where: { id: session.user.orgId },
    data: { settings: { ...settings, apiKeys: keys } },
  })

  // Return the full key ONCE — never stored in plain text
  return NextResponse.json({ key, record: { ...keyRecord, hash: undefined } }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'superadmin'].includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const keyId = searchParams.get('id')
  if (!keyId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const org = await prisma.org.findUnique({ where: { id: session.user.orgId }, select: { settings: true } })
  const settings = (org?.settings as Record<string, unknown>) ?? {}
  const keys = ((settings.apiKeys as Array<{ id: string }>) ?? []).filter(k => k.id !== keyId)

  await prisma.org.update({
    where: { id: session.user.orgId },
    data: { settings: { ...settings, apiKeys: keys } },
  })

  return NextResponse.json({ ok: true })
}
