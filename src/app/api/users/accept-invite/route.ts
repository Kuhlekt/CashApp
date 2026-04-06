// src/app/api/users/accept-invite/route.ts

import { NextRequest, NextResponse } from 'next/server'
import prisma from '../../../../lib/db/client'
import { hash } from 'bcryptjs'
import { z } from 'zod'

const acceptSchema = z.object({
  token: z.string(),
  name: z.string().min(2),
  password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const parsed = acceptSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { token, name, password } = parsed.data

  // Find valid invite
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { org: { select: { id: true, name: true, slug: true } } },
  })

  if (!invite) return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 })
  if (invite.acceptedAt) return NextResponse.json({ error: 'Invite already used' }, { status: 409 })
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: 'Invite expired' }, { status: 410 })

  // Check email not taken
  const existing = await prisma.user.findUnique({ where: { email: invite.email } })
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })

  const passwordHash = await hash(password, 12)
  const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  // Create user and mark invite accepted
  const [user] = await prisma.$transaction([
    prisma.user.create({
      data: {
        orgId: invite.orgId,
        email: invite.email,
        name,
        initials,
        role: invite.role,
        level: 'L2',
        status: 'active',
        passwordHash,
      },
    }),
    prisma.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    }),
  ])

  return NextResponse.json({
    message: `Welcome ${name}! Your account is ready.`,
    email: user.email,
    org: invite.org.name,
  }, { status: 201 })
}
