// src/app/api/pricing/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'

const CURRENCIES: Record<string, string> = { AUD: 'A$', USD: '$', NZD: 'NZ$', GBP: '£', EUR: '€' }

// Static fallback prices when DB has no plans seeded
const STATIC_PLANS = [
  {
    code: 'starter', name: 'Starter',
    description: 'For small AR teams getting started',
    maxUsers: 10, maxBatches: 200,
    features: ['AI invoice matching', 'SFTP/URL file pickup', 'SAP IDOC & CSV export', 'Email notifications', 'Audit trail', '10 users'],
    prices: { AUD: { month: 9900, year: 95040 }, USD: { month: 6900, year: 66240 }, NZD: { month: 11900, year: 114240 }, GBP: { month: 4900, year: 47040 }, EUR: { month: 5900, year: 56640 } }
  },
  {
    code: 'professional', name: 'Professional',
    description: 'For growing teams with complex needs',
    maxUsers: 50, maxBatches: 2000,
    features: ['Everything in Starter', 'ML learning engine', 'Multi-region routing', 'Dual approval flows', 'Priority support', '50 users'],
    prices: { AUD: { month: 34900, year: 335040 }, USD: { month: 24900, year: 239040 }, NZD: { month: 39900, year: 383040 }, GBP: { month: 17900, year: 171840 }, EUR: { month: 19900, year: 191040 } }
  },
  {
    code: 'enterprise', name: 'Enterprise',
    description: 'For large organisations with custom needs',
    maxUsers: 200, maxBatches: 999999,
    features: ['Everything in Professional', 'Custom ERP connectors', 'Dedicated infrastructure', 'SLA guarantee', 'ISO 27001 ready', '200 users'],
    prices: { AUD: { month: 99900, year: 959040 }, USD: { month: 69900, year: 671040 }, NZD: { month: 119900, year: 1151040 }, GBP: { month: 49900, year: 479040 }, EUR: { month: 59900, year: 575040 } }
  },
]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const currency = (searchParams.get('currency') ?? 'AUD').toUpperCase()
  const interval = searchParams.get('interval') ?? 'month'
  const promoCode = searchParams.get('promo')?.toUpperCase()

  const symbol = CURRENCIES[currency] ?? currency

  // Validate promo
  let promo = null
  if (promoCode) {
    try {
      promo = await prisma.promoCode.findUnique({ where: { code: promoCode } })
      if (!promo?.active) return NextResponse.json({ error: 'Invalid promo code' }, { status: 404 })
      if (promo.validUntil && promo.validUntil < new Date()) return NextResponse.json({ error: 'Promo code expired' }, { status: 410 })
      if (promo.maxRedemptions && promo.redemptions >= promo.maxRedemptions) return NextResponse.json({ error: 'Promo code limit reached' }, { status: 410 })
    } catch { promo = null }
  }

  // Try DB plans first
  try {
    const dbPlans = await prisma.plan.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      include: { prices: { where: { currency, interval: interval as string, active: true } } },
    })

    if (dbPlans.length > 0) {
      const result = dbPlans.map(plan => {
        const price = plan.prices[0]
        if (!price && plan.code !== 'enterprise') return null
        let amount = price?.amount ?? 0
        let promoDiscount = 0
        if (promo && (promo.planCodes.length === 0 || promo.planCodes.includes(plan.code))) {
          promoDiscount = promo.discountType === 'percent' ? Math.round(amount * promo.discountValue / 100) : Math.min(promo.discountValue, amount)
          amount -= promoDiscount
        }
        const monthlyEquiv = interval === 'year' ? Math.round(amount / 12) : amount
        return {
          id: plan.id, code: plan.code, name: plan.name, description: plan.description,
          maxUsers: plan.maxUsers, maxBatches: plan.maxBatches, features: plan.features,
          price: {
            id: price?.id, stripePriceId: price?.stripePriceId, currency, symbol, interval,
            amount, originalAmount: price?.amount ?? 0, promoDiscount,
            discountPct: price?.discountPct ?? 0,
            display: plan.code === 'enterprise' ? 'Custom' : `${symbol}${Math.round(amount / 100).toLocaleString()}`,
            monthlyEquiv: `${symbol}${Math.round(monthlyEquiv / 100).toLocaleString()}/mo`,
            annualSaving: interval === 'year' && (price?.discountPct ?? 0) > 0 ? `Save ${price?.discountPct}%` : null,
          },
          promo: promo && promoDiscount > 0 ? { code: promo.code, discount: `${promo.discountValue}% off` } : null,
        }
      }).filter(Boolean)
      return NextResponse.json({ currency, symbol, interval, plans: result, promo: promo ? { code: promo.code, valid: true } : null })
    }
  } catch {}

  // Fallback to static prices
  const ivKey = interval === 'year' ? 'year' : 'month'
  const result = STATIC_PLANS.map(plan => {
    const prices = plan.prices[currency as keyof typeof plan.prices] ?? plan.prices.AUD
    let amount = prices[ivKey as keyof typeof prices]
    let promoDiscount = 0
    if (promo && (promo.planCodes.length === 0 || promo.planCodes.includes(plan.code))) {
      promoDiscount = promo.discountType === 'percent' ? Math.round(amount * promo.discountValue / 100) : 0
      amount -= promoDiscount
    }
    const monthlyEquiv = interval === 'year' ? Math.round(amount / 12) : amount
    return {
      code: plan.code, name: plan.name, description: plan.description,
      maxUsers: plan.maxUsers, maxBatches: plan.maxBatches, features: plan.features,
      price: {
        stripePriceId: null, currency, symbol, interval, amount, promoDiscount, discountPct: 20,
        display: plan.code === 'enterprise' ? 'Custom' : `${symbol}${Math.round(amount / 100).toLocaleString()}`,
        monthlyEquiv: `${symbol}${Math.round(monthlyEquiv / 100).toLocaleString()}/mo`,
        annualSaving: interval === 'year' ? 'Save 20%' : null,
      },
      promo: promo && promoDiscount > 0 ? { code: promo.code, discount: `${promo.discountValue}% off` } : null,
    }
  })

  return NextResponse.json({ currency, symbol, interval, plans: result, promo: promo ? { code: promo.code, valid: true } : null, source: 'static' })
}

// POST — sync to Stripe (superadmin only)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'superadmin') return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const plans = await prisma.plan.findMany({ where: { active: true }, include: { prices: { where: { active: true } } } })
  const results = []

  for (const plan of plans) {
    let product
    const existing = await stripe.products.search({ query: `metadata['planCode']:'${plan.code}'` })
    product = existing.data[0] ?? await stripe.products.create({ name: plan.name, description: plan.description ?? undefined, metadata: { planCode: plan.code } })

    for (const price of plan.prices) {
      if (price.stripePriceId) { results.push({ plan: plan.code, currency: price.currency, status: 'exists' }); continue }
      const sp = await stripe.prices.create({ product: product.id, currency: price.currency.toLowerCase(), unit_amount: price.amount, recurring: { interval: price.interval as 'month' | 'year' }, metadata: { planCode: plan.code, planPriceId: price.id } })
      await prisma.planPrice.update({ where: { id: price.id }, data: { stripePriceId: sp.id } })
      results.push({ plan: plan.code, currency: price.currency, interval: price.interval, status: 'created', stripePriceId: sp.id })
    }
  }

  return NextResponse.json({ ok: true, synced: results.length, results })
}
