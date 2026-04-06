// src/app/api/automation/regions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../lib/auth/config'
import prisma from '../../../../lib/db/client'
import { z } from 'zod'

const regionSchema = z.object({
  code: z.string().min(1).max(20).toUpperCase(),
  name: z.string().min(1).max(100),
  currency: z.string().length(3).default('AUD'),
  bankFilter: z.string().optional(),
  srcUrl: z.string().url().optional().or(z.literal('')),
  refPattern: z.string().optional(),
  active: z.boolean().default(true),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const regions = await prisma.region.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { code: 'asc' },
  })
  return NextResponse.json(regions)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = regionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 })

  // Check uniqueness
  const existing = await prisma.region.findUnique({
    where: { orgId_code: { orgId: session.user.orgId, code: parsed.data.code } },
  })
  if (existing) return NextResponse.json({ error: 'Region code already exists' }, { status: 409 })

  const region = await prisma.region.create({
    data: { orgId: session.user.orgId, ...parsed.data },
  })
  return NextResponse.json(region, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const parsed = regionSchema.partial().safeParse(rest)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 })

  const region = await prisma.region.update({
    where: { id },
    data: parsed.data,
  })
  return NextResponse.json(region)
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.region.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
