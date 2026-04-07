// Redirects authenticated user to Stripe checkout after signup
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.redirect(new URL('/login', req.url))

  const { searchParams } = new URL(req.url)
  const planCode   = searchParams.get('plan') ?? ''
  const currency   = searchParams.get('currency') ?? 'AUD'
  const interval   = searchParams.get('interval') ?? 'month'
  const promoCode  = searchParams.get('promo') ?? ''

  if (!planCode || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.redirect(new URL('/app', req.url))
  }

  try {
    const res = await fetch(new URL('/api/billing', req.url).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({ action: 'checkout', planCode, currency, interval, promoCode: promoCode || undefined }),
    })
    const data = await res.json()
    if (data.url) return NextResponse.redirect(data.url)
  } catch {}

  return NextResponse.redirect(new URL('/app', req.url))
}
