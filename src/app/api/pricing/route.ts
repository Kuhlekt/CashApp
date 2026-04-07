// src/app/api/pricing/route.ts
// Dynamic pricing — returns plans with prices for requested currency/interval
// Also handles Stripe price ID sync and promo validation

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../lib/auth/config'
import prisma from '../../../lib/db/client'

const SUPPORTED_CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR']
const CURRENCY_SYMBOLS: Record<string, string> = { AUD: 'A$', USD: '$', NZD: 'NZ$', GBP: '£', EUR: '€' }

// GET /api/pricing?currency=AUD&interval=month&promo=LAUNCH50
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const currency = (searchParams.get('currency') ?? 'AUD').toUpperCase()
  const interval = searchParams.get('interval') ?? 'month'
  const promoCode = searchParams.get('promo')?.toUpperCase()

  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    return NextResponse.json({ error: `Unsupported currency. Use: ${SUPPORTED_CURRENCIES.join(', ')}` }, { status: 400 })
  }

  // Validate promo code if provided
  let promo = null
  if (promoCode) {
    promo = await prisma.promoCode.findUnique({
      where: { code: promoCode },
    })
    if (!promo || !promo.active) {
      return NextResponse.json({ error: 'Invalid or expired promo code' }, { status: 404 })
    }
    if (promo.validUntil && promo.validUntil < new Date()) {
      return NextResponse.json({ error: 'Promo code has expired' }, { status: 410 })
    }
    if (promo.maxRedemptions && promo.redemptions >= promo.maxRedemptions) {
      return NextResponse.json({ error: 'Promo code has reached its limit' }, { status: 410 })
    }
  }

  // Fetch plans with prices
  const plans = await prisma.plan.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      prices: {
        where: { currency, interval, active: true },
      },
    },
  })

  const symbol = CURRENCY_SYMBOLS[currency] ?? currency

  const result = plans.map(plan => {
    const price = plan.prices[0] ?? null
    if (!price) return null

    let amount = price.amount
    let displayAmount = amount
    let promoDiscount = 0

    // Apply promo discount
    if (promo && (promo.planCodes.length === 0 || promo.planCodes.includes(plan.code))) {
      if (promo.discountType === 'percent') {
        promoDiscount = Math.round(amount * promo.discountValue / 100)
        displayAmount = amount - promoDiscount
      } else if (promo.discountType === 'fixed' && (!promo.currency || promo.currency === currency)) {
        promoDiscount = Math.min(promo.discountValue, amount)
        displayAmount = amount - promoDiscount
      }
    }

    const monthlyEquiv = interval === 'year' ? Math.round(displayAmount / 12) : displayAmount

    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      maxUsers: plan.maxUsers,
      maxBatches: plan.maxBatches,
      features: plan.features,
      price: {
        id: price.id,
        stripePriceId: price.stripePriceId,
        currency,
        symbol,
        interval,
        amount: displayAmount,                           // cents after discount
        originalAmount: amount,                          // cents before discount
        promoDiscount,
        discountPct: price.discountPct,
        display: `${symbol}${(displayAmount / 100).toFixed(0)}`,
        monthlyEquiv: `${symbol}${(monthlyEquiv / 100).toFixed(0)}/mo`,
        annualSaving: interval === 'year' && price.discountPct > 0
          ? `Save ${price.discountPct}%`
          : null,
      },
      promo: promo && promoDiscount > 0 ? {
        code: promo.code,
        discount: promo.discountType === 'percent' ? `${promo.discountValue}% off` : `${symbol}${(promo.discountValue / 100).toFixed(0)} off`,
      } : null,
    }
  }).filter(Boolean)

  return NextResponse.json({
    currency,
    symbol,
    interval,
    plans: result,
    promo: promo ? { code: promo.code, valid: true } : null,
  })
}

// POST /api/pricing/sync — sync prices to Stripe (admin only)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  const plans = await prisma.plan.findMany({
    where: { active: true },
    include: { prices: { where: { active: true } } },
  })

  const results = []

  for (const plan of plans) {
    // Create or get Stripe product
    let product
    const existingProducts = await stripe.products.search({ query: `metadata['planCode']:'${plan.code}'` })
    if (existingProducts.data.length > 0) {
      product = existingProducts.data[0]
    } else {
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description ?? undefined,
        metadata: { planCode: plan.code, maxUsers: String(plan.maxUsers), maxBatches: String(plan.maxBatches) },
      })
    }

    for (const price of plan.prices) {
      if (price.stripePriceId) {
        results.push({ plan: plan.code, currency: price.currency, interval: price.interval, status: 'exists', stripePriceId: price.stripePriceId })
        continue
      }

      // Create Stripe price
      const stripePrice = await stripe.prices.create({
        product: product.id,
        currency: price.currency.toLowerCase(),
        unit_amount: price.amount,
        recurring: { interval: price.interval as 'month' | 'year' },
        metadata: { planCode: plan.code, planPriceId: price.id },
      })

      // Save Stripe price ID back to database
      await prisma.planPrice.update({
        where: { id: price.id },
        data: { stripePriceId: stripePrice.id },
      })

      results.push({ plan: plan.code, currency: price.currency, interval: price.interval, status: 'created', stripePriceId: stripePrice.id })
    }
  }

  // Sync promo codes to Stripe
  const promos = await prisma.promoCode.findMany({ where: { active: true, stripeId: null } })
  for (const promo of promos) {
    try {
      const coupon = await stripe.coupons.create({
        id: promo.code,
        ...(promo.discountType === 'percent'
          ? { percent_off: promo.discountValue }
          : { amount_off: promo.discountValue, currency: (promo.currency ?? 'aud').toLowerCase() }),
        duration: 'once',
        max_redemptions: promo.maxRedemptions ?? undefined,
        redeem_by: promo.validUntil ? Math.floor(promo.validUntil.getTime() / 1000) : undefined,
      })

      const stripePromo = await stripe.promotionCodes.create({
        coupon: coupon.id,
        code: promo.code,
        max_redemptions: promo.maxRedemptions ?? undefined,
      })

      await prisma.promoCode.update({
        where: { id: promo.id },
        data: { stripeId: stripePromo.id },
      })
      results.push({ promo: promo.code, status: 'synced', stripeId: stripePromo.id })
    } catch (err) {
      results.push({ promo: promo.code, status: 'error', error: (err as Error).message })
    }
  }

  return NextResponse.json({ ok: true, synced: results.length, results })
}
