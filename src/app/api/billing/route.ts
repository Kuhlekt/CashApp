// src/app/api/billing/route.ts
// Stripe billing — checkout, portal, webhook

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'

const PLAN_PRICES: Record<string, { priceId: string; mrr: number; maxUsers: number; maxBatches: number }> = {
  starter:      { priceId: process.env.STRIPE_PRICE_STARTER      ?? '', mrr: 99,  maxUsers: 10,  maxBatches: 200 },
  professional: { priceId: process.env.STRIPE_PRICE_PROFESSIONAL ?? '', mrr: 349, maxUsers: 50,  maxBatches: 2000 },
  enterprise:   { priceId: process.env.STRIPE_PRICE_ENTERPRISE   ?? '', mrr: 999, maxUsers: 200, maxBatches: 20000 },
}

// GET /api/billing — get current plan info
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const org = await prisma.org.findUnique({
    where: { id: session.user.orgId },
    select: { plan: true, status: true, mrr: true, trialEndsAt: true, maxUsers: true, maxBatches: true, stripeCustomerId: true, stripeSubId: true },
  })

  const userCount = await prisma.user.count({ where: { orgId: session.user.orgId, status: { not: 'suspended' } } })
  const batchCount = await prisma.batchSession.count({ where: { orgId: session.user.orgId } })

  return NextResponse.json({
    org,
    usage: { users: userCount, batches: batchCount },
    plans: Object.entries(PLAN_PRICES).map(([key, val]) => ({
      id: key,
      name: key.charAt(0).toUpperCase() + key.slice(1),
      mrr: val.mrr,
      maxUsers: val.maxUsers,
      maxBatches: val.maxBatches,
      current: org?.plan === key,
    })),
    trialDaysLeft: org?.trialEndsAt ? Math.max(0, Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null,
  })
}

// POST /api/billing — create checkout session or portal
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'superadmin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { action, plan } = body

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured. Add STRIPE_SECRET_KEY to environment variables.' }, { status: 503 })
  }

  // Lazy import Stripe
  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  const org = await prisma.org.findUnique({ where: { id: session.user.orgId } })
  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 })

  // Create or get Stripe customer
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
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/cashflow-app.html`,
    })
    return NextResponse.json({ url: portalSession.url })
  }

  // Checkout
  if (action === 'checkout' && plan && PLAN_PRICES[plan]) {
    const price = PLAN_PRICES[plan]
    if (!price.priceId) return NextResponse.json({ error: `Price ID for ${plan} not configured` }, { status: 503 })

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: price.priceId, quantity: 1 }],
      success_url: `${appUrl}/cashflow-app.html?upgraded=true`,
      cancel_url: `${appUrl}/cashflow-app.html`,
      metadata: { orgId: org.id, plan },
      subscription_data: { metadata: { orgId: org.id, plan } },
    })
    return NextResponse.json({ url: checkoutSession.url })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
