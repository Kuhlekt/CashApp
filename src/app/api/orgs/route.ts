// src/app/api/orgs/route.ts

import { NextRequest, NextResponse } from 'next/server'
import prisma from '../../../lib/db/client'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { sendWelcomeEmail } from '../../../lib/clicksend/transactional'

const registerSchema = z.object({
  orgName: z.string().min(2).max(100),
  adminName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  plan: z.enum(['trial', 'starter', 'professional']).default('trial'),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })

  const { orgName, adminName, email, password } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })

  const baseSlug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50)
  let slug = baseSlug
  let suffix = 1
  while (await prisma.org.findUnique({ where: { slug } })) { slug = `${baseSlug}-${suffix++}` }

  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  const passwordHash = await hash(password, 12)
  const initials = adminName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  const org = await prisma.$transaction(async (tx) => {
    const newOrg = await tx.org.create({
      data: { name: orgName, slug, plan: 'trial', status: 'trial', trialEndsAt, maxUsers: 3, maxBatches: 20 },
    })
    await tx.user.create({
      data: { orgId: newOrg.id, email: email.toLowerCase(), name: adminName, initials, role: 'admin', level: 'L4', status: 'active', passwordHash },
    })
    await tx.govRules.create({ data: { orgId: newOrg.id } })
    await tx.automationConfig.create({ data: { orgId: newOrg.id } })
    await tx.reasonCode.createMany({ data: [
      { orgId: newOrg.id, code: 'DISC', label: 'Early Payment Discount', type: 'variance' },
      { orgId: newOrg.id, code: 'RTRN', label: 'Return / Credit', type: 'variance' },
      { orgId: newOrg.id, code: 'UNKN', label: 'Unknown', type: 'variance' },
      { orgId: newOrg.id, code: 'UNID', label: 'Unidentified Payment', type: 'on-account' },
    ]})
    await tx.region.createMany({ data: [
      { orgId: newOrg.id, code: 'AU-NSW', name: 'Australia — NSW', currency: 'AUD' },
      { orgId: newOrg.id, code: 'AU-VIC', name: 'Australia — VIC', currency: 'AUD' },
      { orgId: newOrg.id, code: 'NZ', name: 'New Zealand', currency: 'NZD' },
    ]})
    return newOrg
  })

  // Send welcome email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cash-app-three-iota.vercel.app'
  await sendWelcomeEmail({ to: email, toName: adminName, orgName, trialDays: 14, loginUrl: `${appUrl}/login` })

  return NextResponse.json({
    message: `Welcome ${adminName}! Check your email to get started.`,
    org: { id: org.id, name: org.name, slug: org.slug, plan: org.plan, trialEndsAt: org.trialEndsAt },
    email,
  }, { status: 201 })
}
