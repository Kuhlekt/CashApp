// src/app/api/claude/route.ts
// Direct Claude API integration — streaming chat with cash application context
// Supports: general chat, invoice matching queries, exception analysis,
//           automation config help, data analysis

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const SYSTEM_PROMPT = `You are a specialist AI assistant embedded in CashFlow AI — a governed cash application platform built by Hindle Consultants for Kuhlekt.

Your expertise covers:
- **Cash application**: Bank-to-invoice matching, allocation, exception handling, on-account processing
- **AR / Accounts Receivable**: Debtor management, aging analysis, credit terms, dispute resolution
- **Bank file formats**: MT940, CAMT.053, ISO 20022, BAI2, CSV — parsing, validation, field mapping
- **ERP integration**: SAP IDOC, Oracle AR, NetSuite, Xero — output formats and posting rules
- **Automation**: Scheduled runs, SFTP/API file pickup, region-based routing, pipeline configuration
- **Governance**: Audit trails, approval thresholds, dual approval, SHA-256 hash verification
- **ClickSend**: Email/SMS notification setup, sender IDs, template configuration
- **Deployment**: Neon PostgreSQL, Vercel, Railway, GitHub Actions CI/CD

Platform context:
- Built with Next.js 15, Prisma, Neon PostgreSQL, NextAuth v5
- AI matching uses Claude claude-sonnet-4-20250514 via Anthropic API
- Notifications via ClickSend (email + SMS)
- Cron scheduling via Railway + GitHub Actions
- Organisation: Hindle Consultants / Kuhlekt

When helping with technical issues, be specific and provide exact code, commands, or config values.
When analysing financial data, be precise and flag any compliance or governance considerations.
Always consider audit trail implications for financial operations.

Format responses clearly. Use markdown for code blocks, lists, and structure.`

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured. Add it to .env.local' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let body: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    context?: string
    stream?: boolean
  }

  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  const { messages, context, stream = true } = body

  if (!messages?.length) {
    return new Response(JSON.stringify({ error: 'messages array required' }), { status: 400 })
  }

  // Build system prompt — inject any page context (current session data, etc.)
  const systemPrompt = context
    ? `${SYSTEM_PROMPT}\n\n---\n**Current Context:**\n${context}`
    : SYSTEM_PROMPT

  // Streaming response
  if (stream) {
    const encoder = new TextEncoder()

    const readable = new ReadableStream({
      async start(controller) {
        try {
          const stream = await client.messages.stream({
            model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: systemPrompt,
            messages: messages.map(m => ({
              role: m.role,
              content: m.content,
            })),
          })

          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              const data = `data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`
              controller.enqueue(encoder.encode(data))
            }
          }

          // Send done signal
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Stream error'
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
          )
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  // Non-streaming fallback
  try {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    return new Response(JSON.stringify({ text, usage: response.usage }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Claude API error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
