// src/app/api/accounts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'
import { auditLog } from '../../../lib/db/audit'
import { parse as csvParse } from 'csv-parse/sync'
import { z } from 'zod'

const accountSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  terms: z.string().default('NET30'),
  erpId: z.string().optional(),
  industry: z.string().optional(),
  regionCode: z.string().optional(),
  currency: z.string().length(3).default('AUD'),
  creditLimit: z.number().positive().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).default('active'),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const region = searchParams.get('region')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)

  const accounts = await prisma.account.findMany({
    where: {
      orgId: session.user.orgId,
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
      ...(region ? { regionCode: region } : {}),
      status: 'active',
    },
    include: {
      _count: { select: { openItems: true } },
    },
    orderBy: { name: 'asc' },
    skip: (page - 1) * limit,
    take: limit,
  })

  const total = await prisma.account.count({
    where: { orgId: session.user.orgId, status: 'active' },
  })

  return NextResponse.json({ accounts, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contentType = req.headers.get('content-type') ?? ''

  // CSV bulk upload
  if (contentType.includes('text/csv') || contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const text = await file.text()
    let rows: Record<string, string>[]
    try {
      rows = csvParse(text, { columns: true, skip_empty_lines: true, trim: true })
    } catch {
      return NextResponse.json({ error: 'Invalid CSV format' }, { status: 400 })
    }

    const accounts = rows.map(row => ({
      orgId: session.user.orgId,
      code: row.customer_code ?? row.code ?? '',
      name: row.customer_name ?? row.name ?? '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      terms: row.payment_terms ?? row.terms ?? 'NET30',
      erpId: row.erp_customer_id ?? row.erp_id ?? '',
      industry: row.industry ?? '',
      regionCode: row.region_code ?? row.region ?? '',
      currency: row.currency ?? 'AUD',
      source: 'csv' as const,
      syncedAt: new Date(),
    })).filter(a => a.code && a.name)

    if (accounts.length === 0) {
      return NextResponse.json({ error: 'No valid rows found. Check required columns: customer_code, customer_name' }, { status: 400 })
    }

    // Upsert all
    let created = 0, updated = 0
    for (const acct of accounts) {
      const existing = await prisma.account.findUnique({ where: { orgId_code: { orgId: session.user.orgId, code: acct.code } } })
      if (existing) {
        await prisma.account.update({ where: { id: existing.id }, data: acct })
        updated++
      } else {
        await prisma.account.create({ data: acct })
        created++
      }
    }

    await auditLog({ orgId: session.user.orgId, userId: session.user.id, category: 'user', event: 'CSV_LOAD_ACCOUNTS', message: `${accounts.length} accounts loaded from CSV: ${file.name}. Created: ${created}, Updated: ${updated}`, actor: session.user.name, metadata: { filename: file.name, count: accounts.length, created, updated } })
    return NextResponse.json({ success: true, count: accounts.length, created, updated })
  }

  // Single account create
  const body = await req.json()
  const parsed = accountSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 })

  const account = await prisma.account.upsert({
    where: { orgId_code: { orgId: session.user.orgId, code: parsed.data.code } },
    create: { orgId: session.user.orgId, ...parsed.data },
    update: parsed.data,
  })

  return NextResponse.json(account, { status: 201 })
}
