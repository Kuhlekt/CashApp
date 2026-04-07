// src/app/api/billing/webhook/route.ts

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
  } catch {
    return NextResponse.json({ error: 'Webhook signature invalid' }, { status: 400 })
  }

  await prisma.webhookEvent.create({
    data: { provider: 'stripe', eventType: event.type, payload: event as object },
  })

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as {
          metadata: { orgId: string; planCode: string }
          subscription: string
          customer: string
        }
        const { orgId, planCode } = session.metadata
        if (!orgId || !planCode) break

        const plan = await prisma.plan.findUnique({ where: { code: planCode } })
        if (!plan) break

        await prisma.org.update({
          where: { id: orgId },
          data: {
            plan: planCode,
            status: 'active',
            mrr: 0, // Will be updated by subscription.updated
            maxUsers: plan.maxUsers,
            maxBatches: plan.maxBatches,
            stripeSubId: session.subscription as string,
            stripeCustomerId: session.customer as string,
            trialEndsAt: null,
          },
        })
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as {
          metadata: { orgId: string; planCode: string; maxUsers: string; maxBatches: string }
          status: string
          items: { data: Array<{ price: { unit_amount: number; currency: string; recurring: { interval: string } } }> }
        }
        const { orgId, planCode, maxUsers, maxBatches } = sub.metadata ?? {}
        if (!orgId) break

        const priceData = sub.items?.data?.[0]?.price
        // Calculate MRR in cents, store as dollars
        let mrr = 0
        if (priceData?.unit_amount) {
          mrr = priceData.recurring?.interval === 'year'
            ? Math.round(priceData.unit_amount / 12 / 100)
            : Math.round(priceData.unit_amount / 100)
        }

        await prisma.org.update({
          where: { id: orgId },
          data: {
            status: sub.status === 'active' ? 'active' : 'suspended',
            ...(planCode ? { plan: planCode } : {}),
            ...(maxUsers ? { maxUsers: parseInt(maxUsers) } : {}),
            ...(maxBatches ? { maxBatches: parseInt(maxBatches) } : {}),
            ...(mrr ? { mrr } : {}),
          },
        })
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as { metadata: { orgId: string } }
        const { orgId } = sub.metadata ?? {}
        if (!orgId) break

        await prisma.org.update({
          where: { id: orgId },
          data: { status: 'cancelled', plan: 'trial', mrr: 0, stripeSubId: null },
        })
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

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as { customer: string; amount_paid: number; currency: string }
        const org = await prisma.org.findFirst({ where: { stripeCustomerId: invoice.customer } })
        if (org && org.status === 'suspended') {
          await prisma.org.update({ where: { id: org.id }, data: { status: 'active' } })
        }
        break
      }
    }

    await prisma.webhookEvent.updateMany({
      where: { provider: 'stripe', eventType: event.type, processed: false },
      data: { processed: true, processedAt: new Date() },
    })
  } catch (err) {
    await prisma.webhookEvent.updateMany({
      where: { provider: 'stripe', processed: false },
      data: { error: (err as Error).message },
    })
  }

  return NextResponse.json({ received: true })
}
