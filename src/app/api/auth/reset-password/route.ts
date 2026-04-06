// src/app/api/auth/reset-password/route.ts

import { NextRequest, NextResponse } from 'next/server'
import prisma from '../../../../lib/db/client'
import { hash } from 'bcryptjs'
import { randomBytes } from 'crypto'
import { sendPasswordResetEmail } from '../../../../lib/clicksend/transactional'
import { checkRateLimit, RATE_LIMITS } from '../../../../lib/security/rateLimit'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { email, token, password } = body

  // Request reset
  if (email && !token) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
    const rl = await checkRateLimit({ key: `reset:${ip}`, ...RATE_LIMITS.passwordReset })
    if (!rl.allowed) return NextResponse.json({ message: 'If that email exists, a reset link has been sent.' })

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (user) {
      const resetToken = randomBytes(32).toString('hex')
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000)
      await prisma.user.update({ where: { id: user.id }, data: { resetToken, resetTokenExpiry } })
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cash-app-three-iota.vercel.app'
      const resetUrl = `${appUrl}/reset-password?token=${resetToken}`
      await sendPasswordResetEmail({ to: user.email, toName: user.name, resetUrl })
    }
    return NextResponse.json({ message: 'If that email exists, a reset link has been sent.' })
  }

  // Confirm reset
  if (token && password) {
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    const user = await prisma.user.findUnique({ where: { resetToken: token } })
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 })
    }
    const passwordHash = await hash(password, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null, failedLogins: 0, lockedUntil: null },
    })
    return NextResponse.json({ message: 'Password updated. You can now log in.' })
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
}
