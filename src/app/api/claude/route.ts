// src/app/api/claude/route.ts

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { checkRateLimit, RATE_LIMITS } from '../../../lib/security/rateLimit'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SYSTEM = `You are a specialist AI assistant for CashFlow AI — a governed cash application platform by Hindle Consultants / Kuhlekt. Expert in: cash application, bank-to-invoice matching, AR, bank file formats (MT940, CAMT053, BAI2), ERP integration (SAP IDOC, Oracle AR, NetSuite, Xero), exception handling, automation, ClickSend, Neon PostgreSQL, Next.js, Vercel, Railway, GitHub Actions. Be specific, practical, and concise. Use markdown.`

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Claude API not configured' }), { status: 500 })
  }

  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  const rl = await checkRateLimit({ key: `claude:${ip}`, ...RATE_LIMITS.claude })
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) }
    })
  }

  let body: { messages: Array<{ role: string; content: string }>; context?: string }
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { messages, context } = body
  if (!messages?.length) return new Response(JSON.stringify({ error: 'messages required' }), { status: 400 })

  const system = context ? `${SYSTEM}\n\n---\n**Current context:**\n${context}` : SYSTEM

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = await client.messages.stream({
          model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system,
          messages: messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        })
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`))
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`))
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
