// src/app/api/billing/webhook/route.ts
// Stripe webhook — handles subscription lifecycle

import { NextRequest, NextResponse } from 'next/server'
import prisma from '../../../../lib/db/client'

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return NextResponse.json({ error: 'Webhook signature failed' }, { status: 400 })
  }

  // Store raw event
  await prisma.webhookEvent.create({
    data: { provider: 'stripe', eventType: event.type, payload: event as object },
  })

  const PLAN_LOOKUP: Record<string, { plan: string; mrr: number; maxUsers: number; maxBatches: number }> = {
    [process.env.STRIPE_PRICE_STARTER      ?? '']: { plan: 'starter',      mrr: 99,  maxUsers: 10,  maxBatches: 200 },
    [process.env.STRIPE_PRICE_PROFESSIONAL ?? '']: { plan: 'professional', mrr: 349, maxUsers: 50,  maxBatches: 2000 },
    [process.env.STRIPE_PRICE_ENTERPRISE   ?? '']: { plan: 'enterprise',   mrr: 999, maxUsers: 200, maxBatches: 20000 },
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as { metadata: { orgId: string; plan: string }; subscription: string; customer: string }
        const { orgId, plan } = session.metadata
        const planData = PLAN_LOOKUP[plan] ?? null
        if (orgId && planData) {
          await prisma.org.update({
            where: { id: orgId },
            data: {
              plan: planData.plan,
              status: 'active',
              mrr: planData.mrr,
              maxUsers: planData.maxUsers,
              maxBatches: planData.maxBatches,
              stripeSubId: session.subscription as string,
              stripeCustomerId: session.customer as string,
              trialEndsAt: null,
            },
          })
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as { metadata: { orgId: string }; status: string; items: { data: Array<{ price: { id: string } }> } }
        const orgId = sub.metadata?.orgId
        if (orgId) {
          const priceId = sub.items?.data?.[0]?.price?.id
          const planData = priceId ? PLAN_LOOKUP[priceId] : null
          await prisma.org.update({
            where: { id: orgId },
            data: {
              status: sub.status === 'active' ? 'active' : 'suspended',
              ...(planData ? { plan: planData.plan, mrr: planData.mrr, maxUsers: planData.maxUsers, maxBatches: planData.maxBatches } : {}),
            },
          })
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as { metadata: { orgId: string } }
        const orgId = sub.metadata?.orgId
        if (orgId) {
          await prisma.org.update({
            where: { id: orgId },
            data: { status: 'cancelled', plan: 'trial', mrr: 0, stripeSubId: null },
          })
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as { customer: string }
        const org = await prisma.org.findFirst({ where: { stripeCustomerId: invoice.customer } })
        if (org) {
          await prisma.org.update({ where: { id: org.id }, data: { status: 'suspended' } })
        }
        break
      }
    }

    await prisma.webhookEvent.updateMany({
      where: { provider: 'stripe', eventType: event.type, processed: false },
      data: { processed: true, processedAt: new Date() },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Processing error'
    await prisma.webhookEvent.updateMany({
      where: { provider: 'stripe', processed: false },
      data: { error: msg },
    })
  }

  return NextResponse.json({ received: true })
}
