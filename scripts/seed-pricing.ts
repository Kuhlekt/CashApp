// scripts/seed-pricing.ts
// Seeds plans and prices into database
// Run: npx tsx scripts/seed-pricing.ts

import path from 'path'

// Load .env.local
function loadEnv() {
  try {
    const fs = require('fs')
    const envPath = path.resolve(process.cwd(), '.env.local')
    if (!fs.existsSync(envPath)) return
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
      if (!process.env[key]) process.env[key] = val
    }
  } catch {}
}
loadEnv()

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const PLANS = [
  {
    code: 'starter',
    name: 'Starter',
    description: 'For small AR teams getting started with automation',
    sortOrder: 1,
    maxUsers: 10,
    maxBatches: 200,
    features: [
      'AI invoice matching',
      'SFTP/URL file pickup',
      'SAP IDOC & CSV export',
      'Email notifications',
      'Audit trail',
      '5 regions',
      '10 users',
    ],
    prices: [
      // AUD
      { currency: 'AUD', interval: 'month', amount: 9900 },   // $99/mo
      { currency: 'AUD', interval: 'year',  amount: 95040, discountPct: 20 },  // $792/yr (save 20%)
      // USD
      { currency: 'USD', interval: 'month', amount: 6900 },   // $69/mo
      { currency: 'USD', interval: 'year',  amount: 66240, discountPct: 20 },
      // NZD
      { currency: 'NZD', interval: 'month', amount: 11900 },  // $119/mo
      { currency: 'NZD', interval: 'year',  amount: 114240, discountPct: 20 },
      // GBP
      { currency: 'GBP', interval: 'month', amount: 4900 },   // £49/mo
      { currency: 'GBP', interval: 'year',  amount: 47040, discountPct: 20 },
      // EUR
      { currency: 'EUR', interval: 'month', amount: 5900 },   // €59/mo
      { currency: 'EUR', interval: 'year',  amount: 56640, discountPct: 20 },
    ],
  },
  {
    code: 'professional',
    name: 'Professional',
    description: 'For growing AR teams with complex matching needs',
    sortOrder: 2,
    maxUsers: 50,
    maxBatches: 2000,
    features: [
      'Everything in Starter',
      'ML learning engine',
      'Multi-region routing',
      'Dual approval workflows',
      'ERP portal delivery',
      'ClickSend SMS alerts',
      'Priority support',
      '50 users',
    ],
    prices: [
      { currency: 'AUD', interval: 'month', amount: 34900 },  // $349/mo
      { currency: 'AUD', interval: 'year',  amount: 335040, discountPct: 20 },
      { currency: 'USD', interval: 'month', amount: 24900 },
      { currency: 'USD', interval: 'year',  amount: 239040, discountPct: 20 },
      { currency: 'NZD', interval: 'month', amount: 39900 },
      { currency: 'NZD', interval: 'year',  amount: 383040, discountPct: 20 },
      { currency: 'GBP', interval: 'month', amount: 17900 },
      { currency: 'GBP', interval: 'year',  amount: 171840, discountPct: 20 },
      { currency: 'EUR', interval: 'month', amount: 19900 },
      { currency: 'EUR', interval: 'year',  amount: 191040, discountPct: 20 },
    ],
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'For large organisations with custom requirements',
    sortOrder: 3,
    maxUsers: 200,
    maxBatches: 999999,
    features: [
      'Everything in Professional',
      'Custom ERP connectors',
      'Dedicated infrastructure',
      'SLA guarantee',
      'ISO 27001 ready',
      'Custom contract',
      'Dedicated CSM',
      '200 users',
    ],
    prices: [
      { currency: 'AUD', interval: 'month', amount: 99900 },  // $999/mo
      { currency: 'AUD', interval: 'year',  amount: 959040, discountPct: 20 },
      { currency: 'USD', interval: 'month', amount: 69900 },
      { currency: 'USD', interval: 'year',  amount: 671040, discountPct: 20 },
      { currency: 'NZD', interval: 'month', amount: 119900 },
      { currency: 'NZD', interval: 'year',  amount: 1151040, discountPct: 20 },
      { currency: 'GBP', interval: 'month', amount: 49900 },
      { currency: 'GBP', interval: 'year',  amount: 479040, discountPct: 20 },
      { currency: 'EUR', interval: 'month', amount: 59900 },
      { currency: 'EUR', interval: 'year',  amount: 575040, discountPct: 20 },
    ],
  },
]

const PROMO_CODES = [
  {
    code: 'LAUNCH50',
    discountType: 'percent',
    discountValue: 50,
    maxRedemptions: 100,
    validUntil: new Date('2026-12-31'),
    planCodes: ['starter', 'professional'],
  },
  {
    code: 'HINDLE20',
    discountType: 'percent',
    discountValue: 20,
    maxRedemptions: null,
    validUntil: null,
    planCodes: [],
  },
  {
    code: 'ANNUAL3M',
    discountType: 'percent',
    discountValue: 100,
    maxRedemptions: 50,
    validUntil: new Date('2026-06-30'),
    planCodes: [],  // 3 months free on annual — applied as 100% off first 3 invoices in Stripe
  },
]

async function main() {
  console.log('🌱 Seeding pricing...\n')

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set')
    process.exit(1)
  }

  for (const planData of PLANS) {
    const { prices, ...plan } = planData

    const upsertedPlan = await prisma.plan.upsert({
      where: { code: plan.code },
      update: { ...plan, features: plan.features },
      create: { ...plan, features: plan.features },
    })

    console.log(`✓ Plan: ${plan.name}`)

    for (const price of prices) {
      await prisma.planPrice.upsert({
        where: { planId_currency_interval: { planId: upsertedPlan.id, currency: price.currency, interval: price.interval } },
        update: { amount: price.amount, discountPct: price.discountPct ?? 0 },
        create: { planId: upsertedPlan.id, ...price, discountPct: price.discountPct ?? 0 },
      })
      const display = (price.amount / 100).toFixed(2)
      console.log(`  ${price.currency} ${price.interval}: ${display}`)
    }
  }

  for (const promo of PROMO_CODES) {
    await prisma.promoCode.upsert({
      where: { code: promo.code },
      update: { discountValue: promo.discountValue },
      create: promo,
    })
    console.log(`✓ Promo: ${promo.code} (${promo.discountValue}% off)`)
  }

  console.log('\n✅ Pricing seed complete!')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
