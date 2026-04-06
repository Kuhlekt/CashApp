// src/lib/ai/matcher.ts
// Claude AI — Invoice matching, remittance extraction, exception classification
// Model: claude-sonnet-4-20250514 via @anthropic-ai/sdk

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514'

// ─── TYPES ────────────────────────────────────────────────────────────────────
export interface BankTxn {
  id: string
  ref: string
  payer: string
  amount: number
  currency: string
  date: string
  narrative?: string
}

export interface InvoiceCandidate {
  invoiceNumber: string
  customerCode: string
  customerName: string
  outstandingAmount: number
  currency: string
  dueDate?: string
}

export interface MatchResult {
  txnId: string
  matched: boolean
  invoices: string[]
  confidence: number
  method: 'ai'
  reasoning: string
  varianceAmount: number
  suggestedAction: 'confirm' | 'review' | 'exception' | 'on-account'
}

export interface ExceptionClassification {
  txnId: string
  category: string
  suggestedAction: string
  confidence: number
  notes: string
}

// ─── INVOICE MATCHING ─────────────────────────────────────────────────────────
export async function matchInvoices(
  txn: BankTxn,
  candidates: InvoiceCandidate[],
  mlHistory: Array<{ payer: string; ref: string; invoiceNums: string[] }>
): Promise<MatchResult> {
  const historyContext = mlHistory
    .filter(h => h.payer.toLowerCase().includes(txn.payer.toLowerCase().slice(0, 6)))
    .slice(0, 5)
    .map(h => `  - Payer "${h.payer}" ref "${h.ref}" → invoices: ${h.invoiceNums.join(', ')}`)
    .join('\n')

  const prompt = `You are a cash application specialist AI. Match a bank transaction to open invoices.

BANK TRANSACTION:
- ID: ${txn.id}
- Reference: ${txn.ref}
- Payer: ${txn.payer}
- Amount: ${txn.currency} ${txn.amount.toFixed(2)}
- Date: ${txn.date}
- Narrative: ${txn.narrative ?? 'None'}

OPEN INVOICES (top candidates):
${candidates.slice(0, 20).map(inv =>
  `- ${inv.invoiceNumber} | ${inv.customerName} (${inv.customerCode}) | ${inv.currency} ${inv.outstandingAmount.toFixed(2)} | Due: ${inv.dueDate ?? 'N/A'}`
).join('\n')}

HISTORICAL MATCHES (same payer):
${historyContext || '  No history available'}

INSTRUCTIONS:
1. Match the transaction to one or more invoices that sum to approximately the bank amount
2. Consider partial payments, overpayments, and consolidated payments
3. Use payer name fuzzy matching — "Acme Corp" matches "ACME CORPORATION LTD"
4. Reference number matching is highest confidence
5. Amount matching ± 5% is acceptable for partial matches

Respond ONLY with valid JSON matching this exact schema:
{
  "matched": boolean,
  "invoices": ["INV-001", "INV-002"],
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "variance_amount": 0.00,
  "suggested_action": "confirm|review|exception|on-account"
}`

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    return {
      txnId: txn.id,
      matched: parsed.matched ?? false,
      invoices: parsed.invoices ?? [],
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0)),
      method: 'ai',
      reasoning: parsed.reasoning ?? '',
      varianceAmount: parsed.variance_amount ?? 0,
      suggestedAction: parsed.suggested_action ?? 'review',
    }
  } catch (err) {
    console.error('AI matching error for txn', txn.id, err)
    return {
      txnId: txn.id,
      matched: false,
      invoices: [],
      confidence: 0,
      method: 'ai',
      reasoning: 'AI matching failed — manual review required',
      varianceAmount: 0,
      suggestedAction: 'review',
    }
  }
}

// ─── BATCH MATCHING ───────────────────────────────────────────────────────────
export async function batchMatchInvoices(
  transactions: BankTxn[],
  allCandidates: InvoiceCandidate[],
  mlHistory: Array<{ payer: string; ref: string; invoiceNums: string[] }>,
  maxCalls = 200,
  aiThreshold = 0.75
): Promise<MatchResult[]> {
  const results: MatchResult[] = []
  const limited = transactions.slice(0, maxCalls)

  for (const txn of limited) {
    // Filter candidates to this payer's accounts first
    const relevantCandidates = allCandidates.filter(c =>
      c.customerName.toLowerCase().includes(txn.payer.toLowerCase().slice(0, 5)) ||
      c.customerCode === txn.payer
    ).concat(
      // Also include amount-matched candidates
      allCandidates.filter(c =>
        Math.abs(c.outstandingAmount - txn.amount) / txn.amount < 0.1
      )
    ).slice(0, 30)

    const result = await matchInvoices(txn, relevantCandidates.length > 0 ? relevantCandidates : allCandidates.slice(0, 20), mlHistory)
    results.push(result)

    // Brief pause to respect rate limits
    await new Promise(r => setTimeout(r, 100))
  }

  return results
}

// ─── REMITTANCE EXTRACTION ────────────────────────────────────────────────────
export async function extractRemittanceData(emailBody: string): Promise<{
  invoiceNumbers: string[]
  payer: string
  totalAmount: number
  currency: string
  paymentDate: string
  confidence: number
}> {
  const prompt = `Extract payment/remittance information from this email or document text.

TEXT:
${emailBody.slice(0, 3000)}

Respond ONLY with valid JSON:
{
  "invoice_numbers": ["INV-001", "INV-002"],
  "payer": "Company Name",
  "total_amount": 0.00,
  "currency": "AUD",
  "payment_date": "YYYY-MM-DD",
  "confidence": 0.0-1.0
}`

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    return {
      invoiceNumbers: parsed.invoice_numbers ?? [],
      payer: parsed.payer ?? '',
      totalAmount: parsed.total_amount ?? 0,
      currency: parsed.currency ?? 'AUD',
      paymentDate: parsed.payment_date ?? '',
      confidence: parsed.confidence ?? 0,
    }
  } catch {
    return { invoiceNumbers: [], payer: '', totalAmount: 0, currency: 'AUD', paymentDate: '', confidence: 0 }
  }
}

// ─── EXCEPTION CLASSIFICATION ─────────────────────────────────────────────────
export async function classifyException(
  txn: BankTxn,
  candidates: InvoiceCandidate[]
): Promise<ExceptionClassification> {
  const prompt = `Classify a bank transaction exception for a cash application system.

TRANSACTION: ${txn.payer} | ${txn.currency} ${txn.amount} | Ref: ${txn.ref}
OPEN INVOICES FOR THIS PAYER: ${candidates.length} found
${candidates.slice(0, 5).map(c => `  - ${c.invoiceNumber}: ${c.currency} ${c.outstandingAmount}`).join('\n')}

Classify the exception and suggest action. Respond ONLY with JSON:
{
  "category": "unidentified_payer|partial_payment|overpayment|duplicate|currency_mismatch|short_payment|no_invoice",
  "suggested_action": "contact_customer|apply_on_account|request_remittance|write_off|refund|escalate",
  "confidence": 0.0-1.0,
  "notes": "brief explanation"
}`

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    return {
      txnId: txn.id,
      category: parsed.category ?? 'unidentified',
      suggestedAction: parsed.suggested_action ?? 'escalate',
      confidence: parsed.confidence ?? 0,
      notes: parsed.notes ?? '',
    }
  } catch {
    return { txnId: txn.id, category: 'error', suggestedAction: 'escalate', confidence: 0, notes: 'Classification failed' }
  }
}

// ─── ML MATCHING (historical pattern) ────────────────────────────────────────
export function mlMatchInvoices(
  txn: BankTxn,
  candidates: InvoiceCandidate[],
  history: Array<{ payer: string; invoiceNums: string[]; amount: number }>,
  autoThreshold = 0.92
): { matched: boolean; invoices: string[]; confidence: number; method: string } | null {
  // 1. Exact reference match
  const refMatch = candidates.find(c =>
    c.invoiceNumber.toLowerCase() === txn.ref.toLowerCase() ||
    txn.ref.toLowerCase().includes(c.invoiceNumber.toLowerCase())
  )
  if (refMatch) {
    return { matched: true, invoices: [refMatch.invoiceNumber], confidence: 0.98, method: 'reference' }
  }

  // 2. Historical payer pattern match
  const payerHistory = history.filter(h =>
    h.payer.toLowerCase().includes(txn.payer.toLowerCase().slice(0, 6)) ||
    txn.payer.toLowerCase().includes(h.payer.toLowerCase().slice(0, 6))
  )
  if (payerHistory.length > 0) {
    // Find invoices that match the historical amount pattern
    const historicalInvoices = payerHistory[0].invoiceNums
    const matchedCandidates = candidates.filter(c => historicalInvoices.includes(c.invoiceNumber))
    const totalHistorical = matchedCandidates.reduce((s, c) => s + c.outstandingAmount, 0)
    const amountMatch = Math.abs(totalHistorical - txn.amount) / txn.amount < 0.02

    if (amountMatch && matchedCandidates.length > 0) {
      return { matched: true, invoices: matchedCandidates.map(c => c.invoiceNumber), confidence: 0.94, method: 'historical' }
    }
  }

  // 3. Exact amount match to single invoice
  const exactAmount = candidates.find(c =>
    Math.abs(c.outstandingAmount - txn.amount) < 0.01 && c.currency === txn.currency
  )
  if (exactAmount) {
    const conf = 0.88
    if (conf >= autoThreshold) {
      return { matched: true, invoices: [exactAmount.invoiceNumber], confidence: conf, method: 'amount' }
    }
    return { matched: true, invoices: [exactAmount.invoiceNumber], confidence: conf, method: 'amount' }
  }

  return null // No ML match — send to AI
}
