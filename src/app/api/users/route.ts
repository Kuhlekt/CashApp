// src/app/api/users/route.ts
// User management — list, invite, update, suspend

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'
import { hash } from 'bcryptjs'
import { z } from 'zod'

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  role: z.enum(['accountant', 'controller', 'admin']),
  level: z.enum(['L1', 'L2', 'L3', 'L4']).default('L2'),
})

// GET /api/users — list org users
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'superadmin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    where: { orgId: session.user.orgId },
    select: {
      id: true, email: true, name: true, initials: true,
      role: true, level: true, status: true,
      lastLoginAt: true, createdAt: true, totpEnabled: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const invites = await prisma.invite.findMany({
    where: { orgId: session.user.orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
  })

  return NextResponse.json({ users, invites })
}

// POST /api/users — create user directly or send invite
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'superadmin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })

  const { email, name, role, level } = parsed.data

  // Check user limit
  const org = await prisma.org.findUnique({ where: { id: session.user.orgId }, select: { maxUsers: true } })
  const userCount = await prisma.user.count({ where: { orgId: session.user.orgId, status: { not: 'suspended' } } })
  if (org && userCount >= org.maxUsers) {
    return NextResponse.json({ error: `User limit reached (${org.maxUsers}). Upgrade your plan.` }, { status: 403 })
  }

  // Check email not already taken
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })

  // Create invite token (expires 48h)
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)
  const invite = await prisma.invite.create({
    data: {
      orgId: session.user.orgId,
      email,
      role,
      invitedById: session.user.id,
      expiresAt,
    },
  })

  // TODO: send invite email via ClickSend
  // For now return the invite link
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${invite.token}`

  return NextResponse.json({ invite, inviteUrl, message: `Invite created for ${email}` }, { status: 201 })
}

// PATCH /api/users — update user (role, status, level)
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'superadmin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { userId, role, level, status } = body

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // Prevent self-demotion
  if (userId === session.user.id && role && role !== session.user.role) {
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.orgId !== session.user.orgId) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(role ? { role } : {}),
      ...(level ? { level } : {}),
      ...(status ? { status } : {}),
    },
    select: { id: true, email: true, name: true, role: true, level: true, status: true },
  })

  return NextResponse.json(updated)
}
