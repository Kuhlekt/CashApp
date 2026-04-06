// src/app/api/openitems/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'
import { auditLog } from '../../../lib/db/audit'
import { parse as csvParse } from 'csv-parse/sync'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const customerCode = searchParams.get('customerCode')
  const status = searchParams.get('status') ?? 'open'
  const region = searchParams.get('region')
  const overdueOnly = searchParams.get('overdueOnly') === 'true'
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500)

  const now = new Date()

  const items = await prisma.openItem.findMany({
    where: {
      orgId: session.user.orgId,
      ...(status !== 'all' ? { status } : {}),
      ...(customerCode ? { customerCode } : {}),
      ...(region ? { regionCode: region } : {}),
      ...(overdueOnly ? { dueDate: { lt: now } } : {}),
      ...(q ? { OR: [{ invoiceNumber: { contains: q, mode: 'insensitive' } }, { customerCode: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    include: {
      account: { select: { name: true, email: true, terms: true } },
    },
    orderBy: { dueDate: 'asc' },
    skip: (page - 1) * limit,
    take: limit,
  })

  const [total, totalOutstanding, overdueCount] = await Promise.all([
    prisma.openItem.count({ where: { orgId: session.user.orgId, status: 'open' } }),
    prisma.openItem.aggregate({ where: { orgId: session.user.orgId, status: 'open' }, _sum: { outstandingAmount: true } }),
    prisma.openItem.count({ where: { orgId: session.user.orgId, status: 'open', dueDate: { lt: now } } }),
  ])

  return NextResponse.json({
    items,
    total,
    totalOutstanding: totalOutstanding._sum.outstandingAmount ?? 0,
    overdueCount,
    page,
    pages: Math.ceil(total / limit),
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data') || contentType.includes('text/csv')) {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const text = await file.text()
    let rows: Record<string, string>[]
    try {
      rows = csvParse(text, { columns: true, skip_empty_lines: true, trim: true })
    } catch {
      return NextResponse.json({ error: 'Invalid CSV' }, { status: 400 })
    }

    const items = rows.map(row => {
      const invoiceAmount = parseFloat(row.invoice_amount ?? row.amount ?? '0')
      const outstandingAmount = parseFloat(row.outstanding_amount ?? row.outstanding ?? row.invoice_amount ?? '0')
      return {
        orgId: session.user.orgId,
        customerCode: row.customer_code ?? row.account_code ?? '',
        invoiceNumber: row.invoice_number ?? row.invoice_num ?? row.ref ?? '',
        invoiceDate: row.invoice_date ? new Date(row.invoice_date) : null,
        dueDate: row.due_date ? new Date(row.due_date) : null,
        invoiceAmount,
        outstandingAmount,
        currency: row.currency ?? 'AUD',
        regionCode: row.region_code ?? row.region ?? '',
        erpRef: row.erp_ref ?? row.erp_id ?? '',
        status: 'open' as const,
        source: 'csv' as const,
        syncedAt: new Date(),
      }
    }).filter(i => i.customerCode && i.invoiceNumber && i.invoiceAmount > 0)

    if (items.length === 0) {
      return NextResponse.json({ error: 'No valid rows. Required: invoice_number, customer_code, invoice_amount, outstanding_amount, due_date' }, { status: 400 })
    }

    let created = 0, updated = 0
    for (const item of items) {
      const existing = await prisma.openItem.findUnique({ where: { orgId_invoiceNumber: { orgId: session.user.orgId, invoiceNumber: item.invoiceNumber } } })
      if (existing) {
        await prisma.openItem.update({ where: { id: existing.id }, data: item })
        updated++
      } else {
        // Try to link account
        const acct = await prisma.account.findUnique({ where: { orgId_code: { orgId: session.user.orgId, code: item.customerCode } } })
        await prisma.openItem.create({ data: { ...item, accountId: acct?.id } })
        created++
      }
    }

    await auditLog({ orgId: session.user.orgId, userId: session.user.id, category: 'user', event: 'CSV_LOAD_OPENITEMS', message: `${items.length} open items loaded from CSV: ${file.name}. Created: ${created}, Updated: ${updated}`, actor: session.user.name, metadata: { filename: file.name, count: items.length, created, updated } })
    return NextResponse.json({ success: true, count: items.length, created, updated })
  }

  return NextResponse.json({ error: 'Send CSV as multipart/form-data' }, { status: 400 })
}
