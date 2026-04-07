// src/app/api/billing/route.ts
// Stripe billing — uses dynamic pricing from database

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const org = await prisma.org.findUnique({
    where: { id: session.user.orgId },
    select: { plan: true, status: true, mrr: true, trialEndsAt: true, maxUsers: true, maxBatches: true, stripeCustomerId: true, stripeSubId: true },
  })

  const [userCount, batchCount, plans] = await Promise.all([
    prisma.user.count({ where: { orgId: session.user.orgId, status: { not: 'suspended' } } }),
    prisma.batchSession.count({ where: { orgId: session.user.orgId } }),
    prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { code: true, name: true, maxUsers: true, maxBatches: true, features: true } }),
  ])

  return NextResponse.json({
    org,
    usage: { users: userCount, batches: batchCount },
    plans: plans.map(p => ({ ...p, current: org?.plan === p.code })),
    trialDaysLeft: org?.trialEndsAt ? Math.max(0, Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / 86400000)) : null,
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'superadmin'].includes(session.user.role)) return NextResponse.json({ error: 'Admin required' }, { status: 403 })

  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const { action, planCode, currency = 'AUD', interval = 'month', promoCode } = body

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  const org = await prisma.org.findUnique({ where: { id: session.user.orgId } })
  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 })

  // Get or create Stripe customer
  let customerId = org.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      name: org.name,
      metadata: { orgId: org.id, orgSlug: org.slug },
    })
    customerId = customer.id
    await prisma.org.update({ where: { id: org.id }, data: { stripeCustomerId: customerId } })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cash-app-three-iota.vercel.app'

  // Billing portal
  if (action === 'portal') {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/cashflow-app.html`,
    })
    return NextResponse.json({ url: portal.url })
  }

  // Checkout — look up price from database
  if (action === 'checkout' && planCode) {
    // Find the plan price in DB
    const plan = await prisma.plan.findUnique({
      where: { code: planCode },
      include: {
        prices: {
          where: { currency: currency.toUpperCase(), interval, active: true },
        },
      },
    })

    if (!plan) return NextResponse.json({ error: `Plan '${planCode}' not found` }, { status: 404 })

    const price = plan.prices[0]
    if (!price) return NextResponse.json({ error: `No ${currency} ${interval} price for ${planCode}` }, { status: 404 })

    if (!price.stripePriceId) {
      return NextResponse.json({ error: `Stripe price not configured for ${planCode}/${currency}/${interval}. Run /api/pricing sync first.` }, { status: 503 })
    }

    // Validate promo code
    let discounts = undefined
    if (promoCode) {
      const promo = await prisma.promoCode.findUnique({ where: { code: promoCode.toUpperCase() } })
      if (promo?.stripeId && promo.active) {
        discounts = [{ promotion_code: promo.stripeId }]
        // Increment redemption count
        await prisma.promoCode.update({ where: { id: promo.id }, data: { redemptions: { increment: 1 } } })
      }
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: price.stripePriceId, quantity: 1 }],
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      success_url: `${appUrl}/cashflow-app.html?upgraded=true`,
      cancel_url: `${appUrl}/cashflow-app.html`,
      metadata: { orgId: org.id, planCode, currency, interval },
      subscription_data: {
        metadata: { orgId: org.id, planCode, maxUsers: String(plan.maxUsers), maxBatches: String(plan.maxBatches) },
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
