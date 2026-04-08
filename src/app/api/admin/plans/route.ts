import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../lib/auth/config'
import prisma from '../../../../lib/db/client'

const FX: Record<string, number> = { USD: 1, AUD: 1.55, NZD: 1.65, GBP: 0.78, EUR: 0.92 }
const CURRENCIES = ['USD', 'AUD', 'NZD', 'GBP', 'EUR']

function calcMonthly(usdMo: number, currency: string): number {
  const local = usdMo * FX[currency]
  return Math.round(Math.round(local / 5) * 5) * 100 // nearest $5, in cents
}

function calcAnnual(usdMo: number, currency: string, discountPct: number): number {
  const monthly = calcMonthly(usdMo, currency) / 100
  const annual = monthly * 12 * (1 - discountPct / 100)
  return Math.round(Math.round(annual / 5) * 5) * 100
}

function isSA(role: string) { return role === 'superadmin' }

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isSA(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { prices: { orderBy: [{ currency: 'asc' }, { interval: 'asc' }] } },
  })
  return NextResponse.json({ plans, fx: FX })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isSA(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { planId, name, description, maxUsers, maxBatches, features, baseUsdMonth, annualDiscountPct, recalcPrices } = body
  if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 })

  const discPct = parseInt(annualDiscountPct) || 20

  await prisma.plan.update({
    where: { id: planId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(maxUsers !== undefined ? { maxUsers: parseInt(maxUsers) } : {}),
      ...(maxBatches !== undefined ? { maxBatches: parseInt(maxBatches) || 999999 } : {}),
      ...(features !== undefined ? { features } : {}),
      ...(baseUsdMonth !== undefined ? { baseUsdMonth: parseInt(baseUsdMonth) } : {}),
      ...(annualDiscountPct !== undefined ? { annualDiscountPct: discPct } : {}),
    },
  })

  // Recalculate all prices from new USD base + discount
  if (recalcPrices && baseUsdMonth) {
    const usdMo = parseInt(baseUsdMonth) / 100
    for (const currency of CURRENCIES) {
      const monthAmt = calcMonthly(usdMo, currency)
      const yearAmt  = calcAnnual(usdMo, currency, discPct)
      for (const [interval, amount] of [['month', monthAmt], ['year', yearAmt]] as [string, number][]) {
        await prisma.planPrice.upsert({
          where: { planId_currency_interval: { planId, currency, interval } },
          update: { amount, discountPct: interval === 'year' ? discPct : 0 },
          create: { planId, currency, interval, amount, discountPct: interval === 'year' ? discPct : 0, active: true },
        })
      }
    }
  }

  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { prices: { orderBy: [{ currency: 'asc' }, { interval: 'asc' }] } },
  })
  return NextResponse.json({ ok: true, plan })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isSA(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { action, priceId, amount } = body

  if (action === 'update-price' && priceId) {
    const price = await prisma.planPrice.update({
      where: { id: priceId },
      data: { amount: Math.round(parseFloat(amount) * 100) },
    })
    return NextResponse.json({ ok: true, price })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
