// src/lib/clicksend/transactional.ts
// ClickSend transactional emails — invites, password reset, notifications

import axios from 'axios'

const CS_BASE = 'https://rest.clicksend.com/v3'

function auth() {
  const user = process.env.CLICKSEND_USERNAME
  const key  = process.env.CLICKSEND_API_KEY
  if (!user || !key) return null
  return { username: user, password: key }
}

function baseTemplate(title: string, content: string, ctaText?: string, ctaUrl?: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:0;background:#060A14;font-family:system-ui,sans-serif}
.wrap{max-width:580px;margin:40px auto;background:#0D1526;border:1px solid #324D72;border-radius:12px;overflow:hidden}
.hdr{background:linear-gradient(135deg,#0EA5A0,#0284C7);padding:28px 32px}
.hdr-title{color:white;font-size:22px;font-weight:700;margin:0}
.hdr-sub{color:rgba(255,255,255,0.7);font-size:13px;margin:4px 0 0}
.body{padding:28px 32px}
.body p{color:#C4D3E8;font-size:14px;line-height:1.7;margin:0 0 16px}
.cta{display:inline-block;background:#0EA5A0;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;margin:8px 0 20px}
.ftr{padding:18px 32px;border-top:1px solid #324D72;color:#64748b;font-size:11px}
.info-box{background:#172035;border:1px solid #324D72;border-radius:8px;padding:14px 18px;margin:16px 0}
.info-box p{color:#96AECF;font-size:13px;margin:0}
</style></head>
<body><div class="wrap">
<div class="hdr"><div class="hdr-title">⬡ CashFlow AI</div><div class="hdr-sub">${title}</div></div>
<div class="body">
${content}
${ctaText && ctaUrl ? `<a href="${ctaUrl}" class="cta">${ctaText}</a>` : ''}
</div>
<div class="ftr">CashFlow AI by Hindle Consultants / Kuhlekt · This is an automated message · Do not reply</div>
</div></body></html>`
}

async function sendEmail(to: string, toName: string, subject: string, html: string): Promise<boolean> {
  const credentials = auth()
  if (!credentials) {
    console.warn('[ClickSend] Not configured — email not sent:', subject, 'to', to)
    return false
  }

  const addressId = process.env.CLICKSEND_EMAIL_ADDRESS_ID
  if (!addressId) {
    console.warn('[ClickSend] EMAIL_ADDRESS_ID not set')
    return false
  }

  try {
    await axios.post(`${CS_BASE}/email/send`, {
      to: [{ email: to, name: toName }],
      from: {
        email_address_id: parseInt(addressId),
        name: process.env.CLICKSEND_FROM_NAME ?? 'CashFlow AI',
      },
      subject,
      body: html,
    }, {
      auth: credentials,
      headers: { 'Content-Type': 'application/json' },
    })
    console.log(`[ClickSend] Sent "${subject}" to ${to}`)
    return true
  } catch (err) {
    console.error('[ClickSend] Send failed:', (err as Error).message)
    return false
  }
}

// ── INVITE EMAIL ─────────────────────────────────────────────────────────────
export async function sendInviteEmail(params: {
  to: string
  toName: string
  orgName: string
  invitedBy: string
  role: string
  inviteUrl: string
  expiresHours: number
}) {
  const content = `
    <p>Hi ${params.toName},</p>
    <p><strong>${params.invitedBy}</strong> has invited you to join <strong>${params.orgName}</strong> on CashFlow AI as a <strong>${params.role}</strong>.</p>
    <p>CashFlow AI is a governed cash application platform for accounts receivable teams.</p>
    <div class="info-box"><p>⏱ This invite expires in ${params.expiresHours} hours.</p></div>
    <p>Click the button below to accept your invitation and set up your account:</p>
  `
  return sendEmail(
    params.to,
    params.toName,
    `You've been invited to ${params.orgName} on CashFlow AI`,
    baseTemplate('Team Invitation', content, 'Accept Invitation →', params.inviteUrl)
  )
}

// ── PASSWORD RESET EMAIL ──────────────────────────────────────────────────────
export async function sendPasswordResetEmail(params: {
  to: string
  toName: string
  resetUrl: string
}) {
  const content = `
    <p>Hi ${params.toName},</p>
    <p>We received a request to reset your CashFlow AI password.</p>
    <div class="info-box"><p>⏱ This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p></div>
    <p>Click the button below to reset your password:</p>
  `
  return sendEmail(
    params.to,
    params.toName,
    'Reset your CashFlow AI password',
    baseTemplate('Password Reset', content, 'Reset Password →', params.resetUrl)
  )
}

// ── WELCOME EMAIL ─────────────────────────────────────────────────────────────
export async function sendWelcomeEmail(params: {
  to: string
  toName: string
  orgName: string
  trialDays: number
  loginUrl: string
}) {
  const content = `
    <p>Hi ${params.toName},</p>
    <p>Welcome to CashFlow AI! Your organisation <strong>${params.orgName}</strong> is ready.</p>
    <div class="info-box">
      <p>🎉 Your ${params.trialDays}-day free trial has started. No credit card required.</p>
    </div>
    <p><strong>What you can do:</strong></p>
    <p>• Upload bank files and debtor data<br>
    • AI-powered invoice matching (MT940, CAMT053, BAI2)<br>
    • Automated exception handling and ERP export<br>
    • Schedule automated nightly runs<br>
    • Invite your team</p>
  `
  return sendEmail(
    params.to,
    params.toName,
    `Welcome to CashFlow AI — your trial has started`,
    baseTemplate('Welcome to CashFlow AI', content, 'Open CashFlow AI →', params.loginUrl)
  )
}

// ── BATCH COMPLETE EMAIL ──────────────────────────────────────────────────────
export async function sendBatchCompleteEmail(params: {
  to: string
  toName: string
  orgName: string
  sessionRef: string
  matched: number
  exceptions: number
  totalValue: string
  appUrl: string
}) {
  const content = `
    <p>Hi ${params.toName},</p>
    <p>Your automated cash application run has completed for <strong>${params.orgName}</strong>.</p>
    <div class="info-box">
      <p>📋 Session: <strong>${params.sessionRef}</strong><br>
      ✓ Matched: <strong>${params.matched} transactions</strong><br>
      ⚠ Exceptions: <strong>${params.exceptions}</strong><br>
      💰 Total value: <strong>${params.totalValue}</strong></p>
    </div>
    ${params.exceptions > 0 ? '<p>There are exceptions requiring your review before ERP export.</p>' : '<p>All transactions matched successfully. You can proceed to ERP export.</p>'}
  `
  return sendEmail(
    params.to,
    params.toName,
    `CashFlow AI — Batch ${params.sessionRef} complete`,
    baseTemplate('Batch Complete', content, 'Review in CashFlow AI →', params.appUrl)
  )
}

// ── TRIAL EXPIRY WARNING ──────────────────────────────────────────────────────
export async function sendTrialExpiryEmail(params: {
  to: string
  toName: string
  orgName: string
  daysLeft: number
  upgradeUrl: string
}) {
  const content = `
    <p>Hi ${params.toName},</p>
    <p>Your CashFlow AI trial for <strong>${params.orgName}</strong> expires in <strong>${params.daysLeft} day${params.daysLeft === 1 ? '' : 's'}</strong>.</p>
    <p>Upgrade now to keep access to all features including automated processing, AI matching, and ERP export.</p>
    <div class="info-box">
      <p>💡 Starter from $99/month · Professional from $349/month · Enterprise from $999/month</p>
    </div>
  `
  return sendEmail(
    params.to,
    params.toName,
    `Your CashFlow AI trial expires in ${params.daysLeft} day${params.daysLeft === 1 ? '' : 's'}`,
    baseTemplate('Trial Expiring Soon', content, 'Upgrade Now →', params.upgradeUrl)
  )
}
