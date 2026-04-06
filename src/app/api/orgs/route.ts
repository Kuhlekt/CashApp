// src/app/api/orgs/route.ts
// Organisation registration — self-serve signup

import { NextRequest, NextResponse } from 'next/server'
import prisma from '../../../lib/db/client'
import { hash } from 'bcryptjs'
import { z } from 'zod'

const registerSchema = z.object({
  orgName: z.string().min(2).max(100),
  adminName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  plan: z.enum(['trial', 'starter', 'professional']).default('trial'),
})

// POST /api/orgs — register new organisation
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  const { orgName, adminName, email, password, plan } = parsed.data

  // Check email not taken
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })

  // Generate slug
  const baseSlug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50)
  let slug = baseSlug
  let suffix = 1
  while (await prisma.org.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix++}`
  }

  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 day trial
  const passwordHash = await hash(password, 12)
  const initials = adminName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  // Create org + admin user + default config in one transaction
  const org = await prisma.$transaction(async (tx) => {
    const newOrg = await tx.org.create({
      data: {
        name: orgName,
        slug,
        plan,
        status: 'trial',
        trialEndsAt,
        maxUsers: plan === 'trial' ? 3 : plan === 'starter' ? 10 : 50,
        maxBatches: plan === 'trial' ? 20 : plan === 'starter' ? 200 : 2000,
      },
    })

    await tx.user.create({
      data: {
        orgId: newOrg.id,
        email: email.toLowerCase(),
        name: adminName,
        initials,
        role: 'admin',
        level: 'L4',
        status: 'active',
        passwordHash,
      },
    })

    // Default governance rules
    await tx.govRules.create({
      data: {
        orgId: newOrg.id,
        minConfidence: 85,
        requireApproval: 50000,
        dualApproval: true,
      },
    })

    // Default automation config
    await tx.automationConfig.create({
      data: {
        orgId: newOrg.id,
        enabled: false,
        timezone: 'Australia/Sydney',
      },
    })

    // Default reason codes
    const codes = [
      { code: 'DISC', label: 'Early Payment Discount', type: 'variance' },
      { code: 'DAMT', label: 'Damaged Goods', type: 'variance' },
      { code: 'RTRN', label: 'Return / Credit', type: 'variance' },
      { code: 'UNKN', label: 'Unknown', type: 'variance' },
      { code: 'UNID', label: 'Unidentified Payment', type: 'on-account' },
      { code: 'ADV',  label: 'Advance Payment', type: 'on-account' },
    ]
    await tx.reasonCode.createMany({
      data: codes.map(c => ({ orgId: newOrg.id, ...c })),
    })

    // Default regions
    await tx.region.createMany({
      data: [
        { orgId: newOrg.id, code: 'AU-NSW', name: 'Australia — NSW', currency: 'AUD' },
        { orgId: newOrg.id, code: 'AU-VIC', name: 'Australia — VIC', currency: 'AUD' },
        { orgId: newOrg.id, code: 'NZ', name: 'New Zealand', currency: 'NZD' },
      ],
    })

    return newOrg
  })

  return NextResponse.json({
    message: `Welcome ${adminName}! Your account is ready.`,
    org: { id: org.id, name: org.name, slug: org.slug, plan: org.plan, trialEndsAt: org.trialEndsAt },
    email,
  }, { status: 201 })
}
