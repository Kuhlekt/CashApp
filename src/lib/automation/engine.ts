// src/app/api/erp/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'
import { auditLog } from '../../../lib/db/audit'
import { generateOutputFile, deliverOutputFile } from '../../../lib/automation/engine'
import { sendNotification } from '../../../lib/clicksend/client'
import { createHash } from 'crypto'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')

  const exports = await prisma.erpExport.findMany({
    where: { orgId: session.user.orgId, ...(sessionId ? { sessionId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  // Current session exception count (gate check)
  let excCount = 0
  if (sessionId) {
    const sess = await prisma.batchSession.findUnique({ where: { id: sessionId } })
    excCount = sess?.exceptions ?? 0
  }

  return NextResponse.json({ exports, excCount, canExport: excCount === 0 })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { sessionId, action } = body

  // Approve existing export
  if (action === 'approve') {
    const { exportId } = body
    if (!['L3', 'L4'].includes(session.user.level)) {
      return NextResponse.json({ error: 'L3+ required to approve ERP exports' }, { status: 403 })
    }

    const updated = await prisma.erpExport.update({
      where: { id: exportId, orgId: session.user.orgId },
      data: { status: 'approved', approvedBy: session.user.name, approvedAt: new Date() },
    })

    await auditLog({ orgId: session.user.orgId, sessionId: updated.sessionId ?? undefined, userId: session.user.id, category: 'approve', event: 'ERP_APPROVED', message: `ERP export approved: ${updated.filename}`, actor: session.user.name })
    return NextResponse.json({ success: true, export: updated })
  }

  // Generate new export
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  // Gate: check no unresolved exceptions
  const sess = await prisma.batchSession.findUnique({ where: { id: sessionId, orgId: session.user.orgId } })
  if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (sess.exceptions > 0) {
    return NextResponse.json({ error: `ERP export blocked — ${sess.exceptions} unresolved exception${sess.exceptions > 1 ? 's' : ''} must be resolved first`, blocked: true }, { status: 422 })
  }

  // Get confirmed allocations
  const allocations = await prisma.allocation.findMany({
    where: { sessionId, orgId: session.user.orgId, status: { in: ['confirmed', 'approved'] } },
    include: { txn: true, lines: { include: { openItem: true } } },
  })

  if (allocations.length === 0) {
    return NextResponse.json({ error: 'No confirmed allocations to export' }, { status: 400 })
  }

  // Get output config
  const autoCfg = await prisma.automationConfig.findUnique({ where: { orgId: session.user.orgId } })
  const format = autoCfg?.outputFormat ?? 'sap-idoc'
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const seq = String(await prisma.erpExport.count({ where: { orgId: session.user.orgId } }) + 1).padStart(4, '0')
  const filename = (autoCfg?.outputFilename ?? 'CASHAPP_{date}_{seq}.txt')
    .replace('{date}', date).replace('{seq}', seq).replace('{region}', 'ALL').replace('{format}', format)

  const { content, mimeType } = generateOutputFile(
    allocations.map(a => ({
      txnRef: a.txn?.txnRef ?? '',
      payer: a.txn?.payer ?? '',
      amount: parseFloat(a.totalAllocated.toString()),
      invoices: a.lines.map(l => l.openItem.invoiceNumber),
    })),
    format,
    sess.sessionRef
  )

  const hash = createHash('sha256').update(content).digest('hex')
  const totalValue = allocations.reduce((s, a) => s + parseFloat(a.totalAllocated.toString()), 0)

  // Determine status — if governance requires approval, set pending
  const govRules = await prisma.govRules.findUnique({ where: { orgId: session.user.orgId } })
  const needsApproval = govRules?.erpApproval ?? true

  const erpExport = await prisma.erpExport.create({
    data: {
      orgId: session.user.orgId,
      sessionId,
      filename,
      format,
      records: allocations.length,
      totalValue,
      status: needsApproval ? 'pending' : 'approved',
      sha256Hash: hash,
      ...(needsApproval ? {} : { approvedBy: 'auto', approvedAt: new Date() }),
    },
  })

  // Deliver if approved and destination configured
  let delivered = false
  if (!needsApproval && autoCfg?.outputDestUrl) {
    const { success } = await deliverOutputFile(content, filename, autoCfg)
    if (success) {
      await prisma.erpExport.update({ where: { id: erpExport.id }, data: { status: 'posted', deliveredTo: autoCfg.outputDestUrl, deliveredAt: new Date() } })
      delivered = true
    }
  }

  await auditLog({ orgId: session.user.orgId, sessionId, userId: session.user.id, category: 'user', event: 'ERP_GENERATED', message: `ERP output generated: ${filename}. ${allocations.length} records. SHA-256: ${hash.slice(0, 16)}... Status: ${needsApproval ? 'pending approval' : 'auto-approved'}`, actor: session.user.name, metadata: { filename, format, records: allocations.length, totalValue, hash } })

  // Notify
  const org = await prisma.org.findUnique({ where: { id: session.user.orgId }, select: { name: true } })
  await sendNotification(session.user.orgId, 'erp_ready', { orgName: org?.name ?? '', filename, records: allocations.length, totalValue, currency: 'AUD' })

  // Return file for download if no auto-delivery
  if (!autoCfg?.outputDestUrl) {
    return new NextResponse(content, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Export-Id': erpExport.id,
        'X-SHA256': hash,
      },
    })
  }

  return NextResponse.json({ success: true, export: erpExport, delivered, filename, hash })
}
