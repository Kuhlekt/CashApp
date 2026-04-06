// src/lib/automation/engine.ts
// Automation Engine — Scheduled runs, file pickup, pipeline orchestration
// Designed for Railway cron + Vercel API routes

import { createHash } from 'crypto'
import { parse as csvParse } from 'csv-parse/sync'
import axios from 'axios'
import prisma from '../db/client'
import { auditLog } from '../db/audit'
import { batchMatchInvoices, mlMatchInvoices } from '../ai/matcher'
import { sendNotification } from '../clicksend/client'
import type { AutomationConfig, Org } from '@prisma/client'

// ─── FILE PICKUP ───────────────────────────────────────────────────────────────
export async function pickupBankingFile(cfg: AutomationConfig): Promise<{
  content: Buffer | null
  filename: string
  format: string
  error?: string
}> {
  if (!cfg.bankSrcUrl) {
    return { content: null, filename: '', format: '', error: 'No source URL configured' }
  }

  try {
    if (cfg.bankSrcType === 'url') {
      const headers: Record<string, string> = {}
      // Note: In production, decrypt token from secrets manager
      // cfg.bankSrcToken would be decrypted here
      if (cfg.bankSrcAuth === 'Bearer Token') {
        headers['Authorization'] = `Bearer ${process.env.BANK_SRC_TOKEN ?? ''}`
      } else if (cfg.bankSrcAuth === 'API Key') {
        headers['X-API-Key'] = process.env.BANK_SRC_TOKEN ?? ''
      }

      const response = await axios.get(cfg.bankSrcUrl, {
        headers,
        responseType: 'arraybuffer',
        timeout: 30000,
      })

      const filename = cfg.bankSrcUrl.split('/').pop() ?? `bank_${Date.now()}.txt`
      return {
        content: Buffer.from(response.data),
        filename,
        format: cfg.bankSrcFormat ?? 'auto',
      }
    }

    if (cfg.bankSrcType === 'sftp') {
      // SFTP pickup — requires ssh2-sftp-client
      const SftpClient = (await import('ssh2-sftp-client')).default
      const sftp = new SftpClient()
      await sftp.connect({
        host: new URL(cfg.bankSrcUrl).hostname,
        port: 22,
        username: cfg.bankSrcUser ?? '',
        password: process.env.BANK_SFTP_PASSWORD ?? '',
      })

      const files = await sftp.list(cfg.bankSrcPath ?? '/incoming/')
      const pattern = cfg.bankSrcPattern ?? '*.txt'
      const regex = new RegExp(pattern.replace('*', '.*').replace('?', '.'))
      const matching = files.filter(f => regex.test(f.name)).sort((a, b) => b.modifyTime - a.modifyTime)

      if (matching.length === 0) {
        await sftp.end()
        return { content: null, filename: '', format: '', error: 'No matching files at SFTP source' }
      }

      const latest = matching[0]
      const content = await sftp.get(`${cfg.bankSrcPath ?? '/incoming/'}${latest.name}`) as Buffer
      await sftp.end()

      return { content, filename: latest.name, format: cfg.bankSrcFormat ?? 'auto' }
    }

    return { content: null, filename: '', format: '', error: `Unsupported source type: ${cfg.bankSrcType}` }
  } catch (err) {
    return { content: null, filename: '', format: '', error: err instanceof Error ? err.message : 'Pickup failed' }
  }
}

export async function pickupDebtorsData(cfg: AutomationConfig): Promise<{
  accounts: unknown[]
  openItems: unknown[]
  error?: string
}> {
  if (!cfg.debtorSrcUrl) {
    return { accounts: [], openItems: [], error: 'No debtors source URL configured' }
  }

  try {
    const headers: Record<string, string> = {}
    if (cfg.debtorSrcAuth === 'Bearer Token') {
      headers['Authorization'] = `Bearer ${process.env.DEBTOR_SRC_TOKEN ?? ''}`
    }

    const response = await axios.get(cfg.debtorSrcUrl, { headers, timeout: 30000 })

    if (cfg.debtorSrcFormat === 'JSON (REST)') {
      const data = response.data
      return {
        accounts: data.accounts ?? data.customers ?? [],
        openItems: data.open_items ?? data.invoices ?? data.ar ?? [],
      }
    }

    if (cfg.debtorSrcFormat === 'CSV') {
      const text = response.data.toString()
      const rows = csvParse(text, { columns: true, skip_empty_lines: true })
      return { accounts: [], openItems: rows }
    }

    return { accounts: [], openItems: [], error: `Unsupported format: ${cfg.debtorSrcFormat}` }
  } catch (err) {
    return { accounts: [], openItems: [], error: err instanceof Error ? err.message : 'Debtors pickup failed' }
  }
}

// ─── FILE FORMAT DETECTION ────────────────────────────────────────────────────
export function detectBankFileFormat(content: Buffer): string {
  const text = content.toString('utf8', 0, 200)
  if (text.includes(':20:') || text.includes(':28C:')) return 'MT940'
  if (text.includes('<BkToCstmrStmt>') || text.includes('camt.053')) return 'CAMT053'
  if (text.includes('01 ') && text.includes('02 ')) return 'BAI2'
  if (text.includes(',') && text.split('\n')[0].includes('date')) return 'CSV'
  return 'MT940'
}

// ─── SHA-256 FILE HASH ─────────────────────────────────────────────────────────
export function hashFile(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

// ─── OUTPUT FILE GENERATION ───────────────────────────────────────────────────
export function generateOutputFile(
  allocations: Array<{ txnRef: string; payer: string; amount: number; invoices: string[] }>,
  format: string,
  sessionRef: string
): { content: string; mimeType: string } {
  const now = new Date().toISOString()

  if (format === 'csv') {
    const header = 'txn_ref,payer,amount,invoice_numbers,match_method,session\n'
    const rows = allocations.map(a =>
      `${a.txnRef},${a.payer},${a.amount},${a.invoices.join('|')},auto,${sessionRef}`
    ).join('\n')
    return { content: header + rows, mimeType: 'text/csv' }
  }

  if (format === 'json') {
    return {
      content: JSON.stringify({ generated: now, session: sessionRef, allocations }, null, 2),
      mimeType: 'application/json'
    }
  }

  // SAP IDOC (default)
  const lines = [
    `:20:${sessionRef}`,
    `:25:CASHFLOW/AUTO`,
    `:28C:${String(allocations.length).padStart(5, '0')}/001`,
    `:60F:C${now.slice(0, 10).replace(/-/g, '')}AUD0,00`,
    ...allocations.flatMap(a => [
      `:61:${now.slice(2, 10).replace(/-/g, '')}${String(Math.abs(a.amount) * 100).padStart(15, '0')}DR${a.txnRef}`,
      `:86:${a.payer}/${a.invoices.join('/')}`,
    ]),
    `:62F:C${now.slice(0, 10).replace(/-/g, '')}AUD${allocations.reduce((s, a) => s + a.amount, 0).toFixed(2).replace('.', ',')}`,
  ]
  return { content: lines.join('\n'), mimeType: 'text/plain' }
}

// ─── OUTPUT DELIVERY ──────────────────────────────────────────────────────────
export async function deliverOutputFile(
  content: string,
  filename: string,
  cfg: AutomationConfig
): Promise<{ success: boolean; error?: string }> {
  if (!cfg.outputDestUrl) return { success: false, error: 'No destination configured' }

  try {
    if (cfg.outputDestType === 'url') {
      await axios.post(cfg.outputDestUrl, content, {
        headers: {
          'Content-Type': 'text/plain',
          'Authorization': `Bearer ${process.env.OUTPUT_DEST_TOKEN ?? ''}`,
          'X-Filename': filename,
        },
        timeout: 30000,
      })
      return { success: true }
    }

    if (cfg.outputDestType === 'sftp') {
      const SftpClient = (await import('ssh2-sftp-client')).default
      const sftp = new SftpClient()
      await sftp.connect({
        host: new URL(cfg.outputDestUrl).hostname,
        port: 22,
        username: cfg.outputDestUser ?? '',
        password: process.env.OUTPUT_SFTP_PASSWORD ?? '',
      })
      await sftp.put(Buffer.from(content), `${cfg.outputDestUrl}/${filename}`)
      await sftp.end()
      return { success: true }
    }

    return { success: false, error: `Unsupported dest type: ${cfg.outputDestType}` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Delivery failed' }
  }
}

// ─── HANDLE OPEN BATCH ────────────────────────────────────────────────────────
async function handleOpenBatch(
  orgId: string,
  openSession: { id: string; sessionRef: string } | null,
  action: string,
  userId: string
): Promise<'proceed' | 'skip'> {
  if (!openSession) return 'proceed'

  if (action === 'suspend') {
    await prisma.batchSession.update({
      where: { id: openSession.id },
      data: { status: 'suspended', suspendedAt: new Date(), suspendReason: 'Auto-suspended by scheduler' },
    })
    await auditLog({ orgId, sessionId: openSession.id, userId, category: 'system', event: 'BATCH_SUSPENDED', message: `Session ${openSession.sessionRef} suspended by automation scheduler`, actor: 'Scheduler' })
    return 'proceed'
  }

  if (action === 'clear') {
    await prisma.batchSession.update({ where: { id: openSession.id }, data: { status: 'archived' } })
    await auditLog({ orgId, sessionId: openSession.id, userId, category: 'system', event: 'BATCH_CLEARED', message: `Session ${openSession.sessionRef} cleared by automation scheduler`, actor: 'Scheduler' })
    return 'proceed'
  }

  if (action === 'skip') {
    await auditLog({ orgId, category: 'system', event: 'AUTO_RUN_SKIPPED', message: `Scheduled run skipped — session ${openSession.sessionRef} still open`, actor: 'Scheduler' })
    return 'skip'
  }

  return 'proceed'
}

// ─── MAIN PIPELINE RUN ────────────────────────────────────────────────────────
export async function runAutomationPipeline(orgId: string, trigger: 'manual' | 'scheduled' | 'api' = 'scheduled') {
  const startedAt = Date.now()
  const org = await prisma.org.findUnique({ where: { id: orgId } })
  if (!org) throw new Error('Org not found')

  const cfg = await prisma.automationConfig.findUnique({ where: { orgId } })
  if (!cfg) throw new Error('Automation config not found')

  // Generate run ref
  const runRef = `RUN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

  // Create run record
  await prisma.automationRun.create({
    data: { orgId, runRef, trigger, status: 'running', startedAt: new Date() }
  })

  await auditLog({ orgId, category: 'system', event: 'AUTO_RUN_START', message: `Automation run ${runRef} started. Trigger: ${trigger}`, actor: 'Scheduler' })

  try {
    // ── 1. Handle open batch ───────────────────────────────────────────────
    const openSession = await prisma.batchSession.findFirst({
      where: { orgId, status: { in: ['open', 'running'] } },
      select: { id: true, sessionRef: true },
    })
    const openBatchDecision = await handleOpenBatch(orgId, openSession, cfg.batchOpenAction, 'system')

    if (openBatchDecision === 'skip') {
      await prisma.automationRun.update({ where: { runRef }, data: { status: 'skipped', completedAt: new Date(), durationSec: Math.round((Date.now() - startedAt) / 1000) } })
      await sendNotification(orgId, 'exception', { orgName: org.name, exceptionCount: 0, sessionRef: runRef })
      return { success: false, reason: 'skipped' }
    }

    // ── 2. Create new batch session ────────────────────────────────────────
    const sessionRef = `SESS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    const session = await prisma.batchSession.create({
      data: { orgId, sessionRef, status: 'running', trigger, startedAt: new Date() }
    })

    await auditLog({ orgId, sessionId: session.id, category: 'system', event: 'BATCH_START', message: `Batch ${sessionRef} started`, actor: 'Scheduler' })

    // ── 3. Pick up banking file ────────────────────────────────────────────
    const { content: bankContent, filename, format, error: bankError } = await pickupBankingFile(cfg)
    if (bankError || !bankContent) {
      throw new Error(`Bank file pickup failed: ${bankError}`)
    }

    const detectedFormat = format === 'auto' ? detectBankFileFormat(bankContent) : format
    const fileHash = hashFile(bankContent)

    const bankFile = await prisma.bankFile.create({
      data: {
        orgId, sessionId: session.id,
        filename, format: detectedFormat,
        sizeBytes: bankContent.length,
        sha256Hash: fileHash,
        sourceType: cfg.bankSrcType,
        sourceUrl: cfg.bankSrcUrl ?? undefined,
      }
    })

    await auditLog({ orgId, sessionId: session.id, category: 'system', event: 'FILE_PICKUP', message: `Bank file picked up: ${filename} (${detectedFormat}, SHA-256: ${fileHash.slice(0, 16)}...)`, actor: 'Scheduler', metadata: { filename, format: detectedFormat, hash: fileHash } })

    // ── 4. Load debtors ────────────────────────────────────────────────────
    const { accounts: debtorAccounts, openItems: debtorOpenItems, error: debtorError } = await pickupDebtorsData(cfg)

    if (debtorError) {
      await auditLog({ orgId, sessionId: session.id, category: 'system', event: 'DEBTOR_PICKUP_WARN', message: `Debtors pickup warning: ${debtorError} — using existing data`, actor: 'Scheduler' })
    }

    // Use existing DB open items if debtors source not configured
    const dbOpenItems = await prisma.openItem.findMany({
      where: { orgId, status: 'open' },
      take: 5000,
    })

    const candidates = dbOpenItems.map(i => ({
      invoiceNumber: i.invoiceNumber,
      customerCode: i.customerCode,
      customerName: i.customerCode,
      outstandingAmount: parseFloat(i.outstandingAmount.toString()),
      currency: i.currency,
      dueDate: i.dueDate?.toISOString().slice(0, 10),
    }))

    // ── 5. Parse bank transactions (simplified — extend per format) ────────
    const transactions = parseBankTransactions(bankContent, detectedFormat, bankFile.id, orgId)

    // Create transaction records
    await prisma.bankTransaction.createMany({ data: transactions })

    await prisma.batchSession.update({
      where: { id: session.id },
      data: { totalRecords: transactions.length, totalValue: transactions.reduce((s, t) => s + t.amount, 0) }
    })

    // ── 6. ML matching pass ────────────────────────────────────────────────
    const mlRecords = await prisma.mLRecord.findMany({ where: { orgId }, take: 1000 })
    const mlHistory = mlRecords.map(r => ({ payer: r.payer, ref: r.txnRef ?? '', invoiceNums: r.invoiceNums, amount: parseFloat(r.amount.toString()) }))

    let mlMatched = 0
    const aiQueue: typeof transactions = []

    for (const txn of transactions) {
      const mlResult = mlMatchInvoices(
        { id: txn.id!, ref: txn.txnRef, payer: txn.payer, amount: txn.amount, currency: txn.currency, date: txn.txnDate.toISOString().slice(0, 10) },
        candidates,
        mlHistory,
        parseFloat(cfg.mlAutoThresh.toString())
      )

      if (mlResult && mlResult.confidence >= parseFloat(cfg.mlAutoThresh.toString())) {
        await createAllocation({ orgId, sessionId: session.id, txnId: txn.id!, invoices: mlResult.invoices, method: mlResult.method, confidence: mlResult.confidence, candidates })
        mlMatched++
      } else {
        aiQueue.push(txn)
      }
    }

    await auditLog({ orgId, sessionId: session.id, category: 'system', event: 'ML_MATCH_COMPLETE', message: `ML matching: ${mlMatched}/${transactions.length} matched. ${aiQueue.length} sent to AI.`, actor: 'Scheduler' })

    // ── 7. AI matching pass ────────────────────────────────────────────────
    let aiMatched = 0
    let exceptions = 0

    if (cfg.aiEnabled && aiQueue.length > 0) {
      const aiResults = await batchMatchInvoices(
        aiQueue.map(t => ({ id: t.id!, ref: t.txnRef, payer: t.payer, amount: t.amount, currency: t.currency, date: t.txnDate.toISOString().slice(0, 10) })),
        candidates,
        mlHistory,
        cfg.aiMaxCallsPerRun,
        parseFloat(cfg.mlAiThresh.toString())
      )

      for (const result of aiResults) {
        if (result.matched && result.confidence >= parseFloat(cfg.mlAiThresh.toString())) {
          await createAllocation({ orgId, sessionId: session.id, txnId: result.txnId, invoices: result.invoices, method: 'ai', confidence: result.confidence, candidates })
          aiMatched++

          // Store ML learning record
          await prisma.mLRecord.create({
            data: { orgId, payer: aiQueue.find(t => t.id === result.txnId)?.payer ?? '', txnRef: aiQueue.find(t => t.id === result.txnId)?.txnRef, amount: aiQueue.find(t => t.id === result.txnId)?.amount ?? 0, invoiceNums: result.invoices, matchMethod: 'ai', confidence: result.confidence, runRef }
          })
        } else {
          exceptions++
          await prisma.bankTransaction.update({ where: { id: result.txnId }, data: { matchStatus: 'exception' } })
        }
      }

      await auditLog({ orgId, sessionId: session.id, category: 'system', event: 'AI_MATCH_COMPLETE', message: `AI matching: ${aiMatched} matched, ${exceptions} exceptions`, actor: 'Scheduler' })
    } else {
      exceptions = aiQueue.length
    }

    const totalMatched = mlMatched + aiMatched
    const matchRate = transactions.length > 0 ? (totalMatched / transactions.length) * 100 : 0

    // ── 8. Update session ──────────────────────────────────────────────────
    await prisma.batchSession.update({
      where: { id: session.id },
      data: { matched: totalMatched, exceptions, matchRate, status: exceptions > 0 ? 'open' : 'complete', completedAt: exceptions === 0 ? new Date() : undefined }
    })

    // ── 9. Generate output file ────────────────────────────────────────────
    let outputFilename = ''
    if (cfg.autoOutput) {
      const allocations = await prisma.allocation.findMany({ where: { sessionId: session.id }, include: { lines: { include: { openItem: true } } } })
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const seq = String(await prisma.erpExport.count({ where: { orgId } }) + 1).padStart(4, '0')
      outputFilename = cfg.outputFilename.replace('{date}', date).replace('{seq}', seq).replace('{region}', 'ALL').replace('{format}', cfg.outputFormat)

      const { content: outputContent } = generateOutputFile(
        allocations.map(a => ({ txnRef: a.txn?.txnRef ?? '', payer: '', amount: parseFloat(a.totalAllocated.toString()), invoices: a.lines.map(l => l.openItem.invoiceNumber) })),
        cfg.outputFormat,
        sessionRef
      )

      const erpExport = await prisma.erpExport.create({
        data: { orgId, sessionId: session.id, filename: outputFilename, format: cfg.outputFormat, records: totalMatched, totalValue: transactions.filter(t => ['matched'].includes(t.matchStatus ?? '')).reduce((s, t) => s + t.amount, 0), sha256Hash: createHash('sha256').update(outputContent).digest('hex') }
      })

      // Deliver
      if (cfg.outputDestUrl) {
        const { success, error } = await deliverOutputFile(outputContent, outputFilename, cfg)
        await prisma.erpExport.update({ where: { id: erpExport.id }, data: { status: success ? 'pending' : 'pending', deliveredTo: cfg.outputDestUrl, deliveredAt: success ? new Date() : undefined } })
        await auditLog({ orgId, sessionId: session.id, category: 'system', event: 'ERP_DELIVERED', message: `Output ${outputFilename} delivered to ${cfg.outputDestUrl}. Success: ${success}${error ? ' Error: ' + error : ''}`, actor: 'Scheduler' })
      }
    }

    // ── 10. Send notifications ─────────────────────────────────────────────
    if (cfg.notifyOnComplete) {
      await sendNotification(orgId, 'batch_complete', { orgName: org.name, sessionRef, matched: totalMatched, exceptions, totalValue: transactions.reduce((s, t) => s + t.amount, 0), currency: 'AUD', matchRate })
      if (exceptions > 0) {
        await sendNotification(orgId, 'exception', { orgName: org.name, exceptionCount: exceptions, sessionRef })
      }
      if (outputFilename && cfg.onErpExport !== false) {
        await sendNotification(orgId, 'erp_ready', { orgName: org.name, filename: outputFilename, records: totalMatched, totalValue: totalMatched * 100, currency: 'AUD' })
      }
    }

    const durationSec = Math.round((Date.now() - startedAt) / 1000)
    await prisma.automationRun.update({
      where: { runRef },
      data: { status: 'complete', completedAt: new Date(), durationSec, bankFile: filename, matched: totalMatched, exceptions, outputFile: outputFilename }
    })

    await auditLog({ orgId, sessionId: session.id, category: 'system', event: 'AUTO_RUN_COMPLETE', message: `Run ${runRef} complete. Matched: ${totalMatched}, Exceptions: ${exceptions}, Duration: ${durationSec}s`, actor: 'Scheduler' })

    return { success: true, runRef, sessionRef, matched: totalMatched, exceptions, durationSec }

  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    await prisma.automationRun.update({ where: { runRef }, data: { status: 'error', completedAt: new Date(), durationSec: Math.round((Date.now() - startedAt) / 1000), error } })
    await auditLog({ orgId, category: 'system', event: 'AUTO_RUN_ERROR', message: `Run ${runRef} failed: ${error}`, actor: 'Scheduler' })
    throw err
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
async function createAllocation({ orgId, sessionId, txnId, invoices, method, confidence, candidates }: {
  orgId: string; sessionId: string; txnId: string; invoices: string[]; method: string; confidence: number; candidates: Array<{ invoiceNumber: string; outstandingAmount: number }>
}) {
  const matchedInvoiceIds: string[] = []
  let totalAllocated = 0

  for (const invNum of invoices) {
    const dbInv = await prisma.openItem.findFirst({ where: { orgId, invoiceNumber: invNum } })
    if (dbInv) {
      matchedInvoiceIds.push(dbInv.id)
      totalAllocated += parseFloat(dbInv.outstandingAmount.toString())
    }
  }

  const allocation = await prisma.allocation.create({
    data: { orgId, sessionId, txnId, totalAllocated, matchMethod: method, aiConfidence: confidence, status: 'confirmed' }
  })

  if (matchedInvoiceIds.length > 0) {
    const txn = await prisma.bankTransaction.findUnique({ where: { id: txnId } })
    await prisma.allocationLine.createMany({
      data: matchedInvoiceIds.map((openItemId, i) => ({
        allocationId: allocation.id,
        openItemId,
        amount: candidates.find(c => c.invoiceNumber === invoices[i])?.outstandingAmount ?? 0
      }))
    })
    const variance = txn ? parseFloat(txn.amount.toString()) - totalAllocated : 0
    await prisma.allocation.update({ where: { id: allocation.id }, data: { variance } })
  }

  await prisma.bankTransaction.update({ where: { id: txnId }, data: { matchStatus: 'matched', matchMethod: method, matchConfidence: confidence } })

  return allocation
}

function parseBankTransactions(content: Buffer, format: string, bankFileId: string, orgId: string) {
  const text = content.toString('utf8')
  const transactions: Array<{ bankFileId: string; orgId: string; txnRef: string; payer: string; amount: number; currency: string; txnDate: Date; narrative?: string; matchStatus: string; id?: string }> = []

  if (format === 'MT940') {
    const entries = text.match(/:61:[^\n]+\n:86:[^\n]+/g) ?? []
    entries.forEach((entry, i) => {
      const line61 = entry.split('\n')[0].replace(':61:', '')
      const line86 = entry.split('\n')[1]?.replace(':86:', '') ?? ''
      const dateStr = line61.slice(0, 6)
      const amount = parseFloat(line61.match(/(\d+,\d+)/)?.[1]?.replace(',', '.') ?? '0')
      const ref = line61.match(/([A-Z0-9-]{6,})/)?.[1] ?? `TXN-${i}`
      transactions.push({
        bankFileId, orgId,
        txnRef: ref,
        payer: line86.slice(0, 50).trim(),
        amount,
        currency: 'AUD',
        txnDate: parseDate6(dateStr),
        narrative: line86,
        matchStatus: 'unmatched',
        id: `${bankFileId}-${i}`,
      })
    })
  } else if (format === 'CSV') {
    const rows = csvParse(text, { columns: true, skip_empty_lines: true })
    rows.forEach((row: Record<string, string>, i: number) => {
      transactions.push({
        bankFileId, orgId,
        txnRef: row.reference ?? row.ref ?? row.txn_ref ?? `CSV-${i}`,
        payer: row.payer ?? row.description ?? row.narrative ?? '',
        amount: parseFloat(row.amount ?? row.credit ?? '0'),
        currency: row.currency ?? 'AUD',
        txnDate: new Date(row.date ?? row.txn_date ?? Date.now()),
        narrative: row.narrative ?? row.description,
        matchStatus: 'unmatched',
      })
    })
  }

  return transactions
}

function parseDate6(str: string): Date {
  if (!str || str.length < 6) return new Date()
  const year = 2000 + parseInt(str.slice(0, 2))
  const month = parseInt(str.slice(2, 4)) - 1
  const day = parseInt(str.slice(4, 6))
  return new Date(year, month, day)
}
