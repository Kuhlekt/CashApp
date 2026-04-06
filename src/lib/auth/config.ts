// src/app/api/allocations/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'
import { auditLog } from '../../../lib/db/audit'
import { matchInvoices } from '../../../lib/ai/matcher'
import { sendNotification } from '../../../lib/clicksend/client'
import { z } from 'zod'

const allocationSchema = z.object({
  sessionId: z.string(),
  txnId: z.string(),
  invoiceIds: z.array(z.string()).min(1),
  varianceCode: z.string().optional(),
  varianceNotes: z.string().optional(),
  notes: z.string().optional(),
  matchMethod: z.string().default('manual'),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')
  const status = searchParams.get('status')

  const allocations = await prisma.allocation.findMany({
    where: {
      orgId: session.user.orgId,
      ...(sessionId ? { sessionId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      txn: true,
      lines: { include: { openItem: true } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return NextResponse.json(allocations)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = allocationSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 })

  const { sessionId, txnId, invoiceIds, varianceCode, varianceNotes, notes, matchMethod } = parsed.data

  // Verify txn belongs to this org
  const txn = await prisma.bankTransaction.findFirst({
    where: { id: txnId, orgId: session.user.orgId },
  })
  if (!txn) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

  // Get open items
  const openItems = await prisma.openItem.findMany({
    where: { id: { in: invoiceIds }, orgId: session.user.orgId },
  })
  if (openItems.length === 0) return NextResponse.json({ error: 'No valid invoices found' }, { status: 404 })

  const totalAllocated = openItems.reduce((s, i) => s + parseFloat(i.outstandingAmount.toString()), 0)
  const variance = parseFloat(txn.amount.toString()) - totalAllocated

  // Governance check — require approval for large allocations
  const govRules = await prisma.govRules.findUnique({ where: { orgId: session.user.orgId } })
  const requiresApproval = govRules && Math.abs(totalAllocated) >= parseFloat(govRules.requireApproval.toString())
  const status_value = requiresApproval ? 'pending' : 'confirmed'

  // Create allocation
  const allocation = await prisma.allocation.create({
    data: {
      orgId: session.user.orgId,
      sessionId,
      txnId,
      userId: session.user.id,
      totalAllocated,
      variance,
      varianceCode,
      varianceNotes,
      notes,
      matchMethod,
      status: status_value,
      lines: {
        create: openItems.map(inv => ({
          openItemId: inv.id,
          amount: parseFloat(inv.outstandingAmount.toString()),
        })),
      },
    },
    include: { lines: { include: { openItem: true } } },
  })

  // Update txn status
  await prisma.bankTransaction.update({
    where: { id: txnId },
    data: { matchStatus: 'matched', matchMethod },
  })

  // Update session counts
  await prisma.batchSession.update({
    where: { id: sessionId },
    data: {
      matched: { increment: 1 },
      exceptions: { decrement: 1 },
    },
  })

  await auditLog({
    orgId: session.user.orgId,
    sessionId,
    userId: session.user.id,
    category: 'user',
    event: 'ALLOCATION_CONFIRMED',
    message: `Allocated: ${txn.txnRef} (${txn.payer}) ${txn.currency} ${txn.amount} → ${openItems.map(i => i.invoiceNumber).join(', ')}${notes ? ` Notes: ${notes}` : ''}`,
    actor: session.user.name,
    metadata: { txnId, invoices: openItems.map(i => i.invoiceNumber), variance, method: matchMethod },
  })

  // Send approval notification if needed
  if (requiresApproval) {
    const org = await prisma.org.findUnique({ where: { id: session.user.orgId }, select: { name: true } })
    await sendNotification(session.user.orgId, 'approval', {
      orgName: org?.name ?? '',
      requestedBy: session.user.name,
      amount: totalAllocated,
      currency: txn.currency,
      sessionRef: sessionId,
    })
  }

  // Record ML learning
  await prisma.mLRecord.create({
    data: {
      orgId: session.user.orgId,
      payer: txn.payer,
      txnRef: txn.txnRef,
      amount: txn.amount,
      txnDate: txn.txnDate,
      invoiceNums: openItems.map(i => i.invoiceNumber),
      matchMethod,
      confidence: 1.0, // Human confirmed = 100% confidence for learning
    },
  })

  return NextResponse.json({ success: true, allocation, requiresApproval })
}

// AI suggest endpoint
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { txnId } = body
  if (!txnId) return NextResponse.json({ error: 'txnId required' }, { status: 400 })

  const txn = await prisma.bankTransaction.findFirst({
    where: { id: txnId, orgId: session.user.orgId },
  })
  if (!txn) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

  const candidates = await prisma.openItem.findMany({
    where: { orgId: session.user.orgId, status: 'open' },
    take: 50,
    orderBy: { dueDate: 'asc' },
  })

  const mlHistory = await prisma.mLRecord.findMany({
    where: { orgId: session.user.orgId },
    take: 100,
    orderBy: { createdAt: 'desc' },
  })

  const result = await matchInvoices(
    {
      id: txn.id,
      ref: txn.txnRef,
      payer: txn.payer,
      amount: parseFloat(txn.amount.toString()),
      currency: txn.currency,
      date: txn.txnDate.toISOString().slice(0, 10),
    },
    candidates.map(c => ({
      invoiceNumber: c.invoiceNumber,
      customerCode: c.customerCode,
      customerName: c.customerCode,
      outstandingAmount: parseFloat(c.outstandingAmount.toString()),
      currency: c.currency,
      dueDate: c.dueDate?.toISOString().slice(0, 10),
    })),
    mlHistory.map(h => ({ payer: h.payer, ref: h.txnRef ?? '', invoiceNums: h.invoiceNums }))
  )

  return NextResponse.json(result)
}
