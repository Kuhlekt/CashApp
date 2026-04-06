// src/app/api/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'
import { sendEmail, sendSMS } from '../../../lib/clicksend/client'
import { z } from 'zod'

const notifConfigSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.enum(['clicksend', 'smtp', 'sendgrid']).optional(),
  clicksendUsername: z.string().optional(),
  fromEmail: z.string().email().optional().or(z.literal('')),
  fromName: z.string().optional(),
  fromPhone: z.string().optional(),
  recipientEmail: z.string().email().optional().or(z.literal('')),
  recipientPhone: z.string().optional(),
  onBatchComplete: z.boolean().optional(),
  onException: z.boolean().optional(),
  onApproval: z.boolean().optional(),
  onErpExport: z.boolean().optional(),
  onAgingAlert: z.boolean().optional(),
  dailySummary: z.boolean().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cfg = await prisma.notificationConfig.findUnique({
    where: { orgId: session.user.orgId },
  })

  // Strip sensitive fields from response
  if (cfg) {
    return NextResponse.json({ ...cfg, clicksendApiKey: cfg.clicksendApiKey ? '••••••••' : '' })
  }
  return NextResponse.json(null)
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Handle API key separately — only update if provided (not placeholder)
  const apiKey = body.clicksendApiKey && body.clicksendApiKey !== '••••••••'
    ? body.clicksendApiKey
    : undefined

  const parsed = notifConfigSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 })

  const cfg = await prisma.notificationConfig.upsert({
    where: { orgId: session.user.orgId },
    create: {
      orgId: session.user.orgId,
      ...parsed.data,
      ...(apiKey ? { clicksendApiKey: apiKey } : {}),
    },
    update: {
      ...parsed.data,
      ...(apiKey ? { clicksendApiKey: apiKey } : {}),
    },
  })

  return NextResponse.json({ success: true, cfg: { ...cfg, clicksendApiKey: '••••••••' } })
}

// Test notification endpoint
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { type = 'email' } = body

  const cfg = await prisma.notificationConfig.findUnique({ where: { orgId: session.user.orgId } })
  if (!cfg?.recipientEmail) {
    return NextResponse.json({ error: 'Configure recipient email first' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.cashflow.ai'

  if (type === 'sms' && cfg.recipientPhone) {
    const result = await sendSMS({
      to: cfg.recipientPhone,
      body: `CashFlow AI test SMS from ${session.user.orgName}. Notifications are working correctly. ${appUrl}`,
    })
    return NextResponse.json(result)
  }

  const result = await sendEmail({
    to: cfg.recipientEmail,
    subject: '✅ CashFlow AI — Test Notification',
    body: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#0EA5A0;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">Test Notification</h2>
  </div>
  <div style="padding:24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
    <p>This is a test notification from <strong>CashFlow AI</strong> for organisation <strong>${session.user.orgName}</strong>.</p>
    <p>If you received this email, your ClickSend notification configuration is working correctly.</p>
    <p style="color:#64748b;font-size:13px">Sent by: ${session.user.name} · ${new Date().toLocaleString('en-AU')}</p>
    <a href="${appUrl}/settings" style="background:#0EA5A0;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:8px">
      Open CashFlow AI →
    </a>
  </div>
</div>`,
    fromName: cfg.fromName ?? 'CashFlow AI',
    fromEmail: cfg.fromEmail ?? undefined,
  })

  return NextResponse.json(result)
}
