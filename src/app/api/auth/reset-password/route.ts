// src/app/api/auth/reset-password/route.ts

import { NextRequest, NextResponse } from 'next/server'
import prisma from '../../../../lib/db/client'
import { hash } from 'bcryptjs'
import { randomBytes } from 'crypto'

// POST — request reset or confirm reset
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { email, token, password } = body

  // Step 1: Request reset — generate token
  if (email && !token) {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    // Always return success to prevent email enumeration
    if (user) {
      const resetToken = randomBytes(32).toString('hex')
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken, resetTokenExpiry },
      })
      // TODO: send email via ClickSend
      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${resetToken}`
      console.log(`[Reset] ${email}: ${resetUrl}`) // Log for now
    }
    return NextResponse.json({ message: 'If that email exists, a reset link has been sent.' })
  }

  // Step 2: Confirm reset — validate token and set new password
  if (token && password) {
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

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
