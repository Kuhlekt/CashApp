// src/lib/clicksend/client.ts
// ClickSend — Email and SMS notifications for CashFlow events
// Docs: https://developers.clicksend.com/docs/rest/v3/

import axios from 'axios'

const BASE_URL = 'https://rest.clicksend.com/v3'

function getAuth() {
  return {
    username: process.env.CLICKSEND_USERNAME!,
    password: process.env.CLICKSEND_API_KEY!,
  }
}

// ─── EMAIL ────────────────────────────────────────────────────────────────────
export async function sendEmail({
  to,
  subject,
  body,
  fromEmail = process.env.CLICKSEND_FROM_EMAIL!,
  fromName = process.env.CLICKSEND_FROM_NAME ?? 'CashFlow AI',
}: {
  to: string | string[]
  subject: string
  body: string
  fromEmail?: string
  fromName?: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const recipients = Array.isArray(to) ? to : [to]

  try {
    const response = await axios.post(
      `${BASE_URL}/email/send`,
      {
        to: recipients.map(email => ({ email, name: '' })),
        from: {
          email_address_id: parseInt(process.env.CLICKSEND_EMAIL_ADDRESS_ID ?? '6504'),
          name: fromName,
        },
        subject,
        body,
      },
      { auth: getAuth() }
    )

    return {
      success: response.data.response_code === 'SUCCESS',
      messageId: response.data.data?.messages?.[0]?.message_id,
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'ClickSend email failed'
    console.error('ClickSend email error:', error)
    return { success: false, error }
  }
}

// ─── SMS ──────────────────────────────────────────────────────────────────────
export async function sendSMS({
  to,
  body,
  from = process.env.CLICKSEND_FROM_PHONE ?? 'CashFlow',
}: {
  to: string | string[]
  body: string
  from?: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const recipients = Array.isArray(to) ? to : [to]

  try {
    const response = await axios.post(
      `${BASE_URL}/sms/send`,
      {
        messages: recipients.map(phone => ({
          source: 'cashflow-ai',
          body,
          to: phone,
          from,
        })),
      },
      { auth: getAuth() }
    )

    return {
      success: response.data.response_code === 'SUCCESS',
      messageId: response.data.data?.messages?.[0]?.message_id,
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'ClickSend SMS failed'
    console.error('ClickSend SMS error:', error)
    return { success: false, error }
  }
}

// ─── NOTIFICATION TEMPLATES ───────────────────────────────────────────────────
export function buildBatchCompleteEmail(data: {
  orgName: string
  sessionRef: string
  matched: number
  exceptions: number
  totalValue: number
  currency: string
  matchRate: number
  appUrl: string
}): { subject: string; body: string } {
  return {
    subject: `✅ CashFlow AI — Batch Complete: ${data.sessionRef}`,
    body: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#0EA5A0;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">Batch Processing Complete</h2>
    <p style="margin:4px 0 0;opacity:0.85;font-size:14px">${data.orgName} · ${data.sessionRef}</p>
  </div>
  <div style="padding:24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="padding:8px 0;color:#64748b;font-size:14px">Matched</td>
        <td style="padding:8px 0;font-weight:700;color:#16a34a;font-size:16px;text-align:right">${data.matched} transactions</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b;font-size:14px">Exceptions</td>
        <td style="padding:8px 0;font-weight:700;color:${data.exceptions > 0 ? '#dc2626' : '#16a34a'};font-size:16px;text-align:right">${data.exceptions}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b;font-size:14px">Total Value</td>
        <td style="padding:8px 0;font-weight:700;font-size:16px;text-align:right">${data.currency} ${data.totalValue.toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b;font-size:14px">Match Rate</td>
        <td style="padding:8px 0;font-weight:700;color:#0EA5A0;font-size:16px;text-align:right">${data.matchRate.toFixed(1)}%</td>
      </tr>
    </table>
    ${data.exceptions > 0 ? `
    <div style="margin-top:16px;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px">
      <strong style="color:#dc2626">⚠ ${data.exceptions} exception${data.exceptions > 1 ? 's' : ''} require manual review</strong>
    </div>` : ''}
    <div style="margin-top:20px;text-align:center">
      <a href="${data.appUrl}/pipeline" style="background:#0EA5A0;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
        View in CashFlow AI →
      </a>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:12px">
    CashFlow AI · Powered by Anthropic Claude · <a href="${data.appUrl}/settings/notifications" style="color:#94a3b8">Unsubscribe</a>
  </p>
</div>`,
  }
}

export function buildExceptionAlertEmail(data: {
  orgName: string
  exceptionCount: number
  sessionRef: string
  appUrl: string
}): { subject: string; body: string } {
  return {
    subject: `⚠️ CashFlow AI — ${data.exceptionCount} Exception${data.exceptionCount > 1 ? 's' : ''} Require Review`,
    body: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#dc2626;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">Exceptions Require Review</h2>
    <p style="margin:4px 0 0;opacity:0.85;font-size:14px">${data.orgName} · Session ${data.sessionRef}</p>
  </div>
  <div style="padding:24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:16px;color:#334155">
      <strong>${data.exceptionCount} transaction${data.exceptionCount > 1 ? 's' : ''}</strong> could not be automatically matched and require manual review.
    </p>
    <a href="${data.appUrl}/pipeline?tab=exceptions" style="background:#dc2626;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;margin-top:8px">
      Review Exceptions →
    </a>
  </div>
</div>`,
  }
}

export function buildApprovalRequestEmail(data: {
  orgName: string
  requestedBy: string
  amount: number
  currency: string
  sessionRef: string
  appUrl: string
}): { subject: string; body: string } {
  return {
    subject: `🔐 CashFlow AI — Approval Required: ${data.currency} ${data.amount.toLocaleString()}`,
    body: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#7c3aed;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">Approval Required</h2>
  </div>
  <div style="padding:24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:15px;color:#334155">
      <strong>${data.requestedBy}</strong> has submitted an allocation of 
      <strong>${data.currency} ${data.amount.toLocaleString()}</strong> 
      for approval in session ${data.sessionRef}.
    </p>
    <a href="${data.appUrl}/pipeline?tab=approvals" style="background:#7c3aed;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;margin-top:8px">
      Review & Approve →
    </a>
  </div>
</div>`,
  }
}

export function buildErpReadyEmail(data: {
  orgName: string
  filename: string
  records: number
  totalValue: number
  currency: string
  appUrl: string
}): { subject: string; body: string } {
  return {
    subject: `📤 CashFlow AI — ERP Export Ready: ${data.filename}`,
    body: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#16a34a;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">ERP Export Ready</h2>
  </div>
  <div style="padding:24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
    <p><strong>File:</strong> ${data.filename}</p>
    <p><strong>Records:</strong> ${data.records}</p>
    <p><strong>Total Value:</strong> ${data.currency} ${data.totalValue.toLocaleString()}</p>
    <a href="${data.appUrl}/pipeline?tab=erp" style="background:#16a34a;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;margin-top:8px">
      Download & Approve →
    </a>
  </div>
</div>`,
  }
}

// ─── SEND NOTIFICATION BASED ON CONFIG ───────────────────────────────────────
export async function sendNotification(
  orgId: string,
  event: 'batch_complete' | 'exception' | 'approval' | 'erp_ready',
  data: Record<string, unknown>
) {
  // Load notification config from DB
  const { prisma } = await import('../db/client')
  const cfg = await prisma.notificationConfig.findUnique({ where: { orgId } })
  if (!cfg?.enabled) return

  let emailPayload: { subject: string; body: string } | null = null
  let smsBody: string | null = null

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.cashflow.ai'
  const orgName = (data.orgName as string) ?? 'Your Organisation'

  if (event === 'batch_complete' && cfg.onBatchComplete) {
    emailPayload = buildBatchCompleteEmail({ orgName, appUrl, ...data } as Parameters<typeof buildBatchCompleteEmail>[0])
    smsBody = `CashFlow AI: Batch complete. ${data.matched} matched, ${data.exceptions} exceptions. ${appUrl}`
  } else if (event === 'exception' && cfg.onException) {
    emailPayload = buildExceptionAlertEmail({ orgName, appUrl, ...data } as Parameters<typeof buildExceptionAlertEmail>[0])
    smsBody = `CashFlow AI: ${data.exceptionCount} exceptions need review. ${appUrl}/pipeline`
  } else if (event === 'approval' && cfg.onApproval) {
    emailPayload = buildApprovalRequestEmail({ orgName, appUrl, ...data } as Parameters<typeof buildApprovalRequestEmail>[0])
  } else if (event === 'erp_ready' && cfg.onErpExport) {
    emailPayload = buildErpReadyEmail({ orgName, appUrl, ...data } as Parameters<typeof buildErpReadyEmail>[0])
  }

  if (emailPayload && cfg.recipientEmail) {
    await sendEmail({ to: cfg.recipientEmail, ...emailPayload })
  }

  if (smsBody && cfg.recipientPhone) {
    await sendSMS({ to: cfg.recipientPhone, body: smsBody })
  }
}
