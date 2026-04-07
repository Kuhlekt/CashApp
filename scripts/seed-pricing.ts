// scripts/seed-pricing.ts — run: npx tsx scripts/seed-pricing.ts

import * as fs from 'fs'
import * as path from 'path'

// ── Load env BEFORE Prisma instantiation ─────────────────────────────────────
function loadEnv() {
  const envFiles = ['.env.local', '.env']
  for (const file of envFiles) {
    const envPath = path.resolve(process.cwd(), file)
    if (!fs.existsSync(envPath)) continue
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
    break
  }
}

loadEnv()

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set. Set it as an environment variable or in .env.local')
  console.error('   Example: $env:DATABASE_URL="postgresql://..." (PowerShell)')
  process.exit(1)
}

console.log('✓ DATABASE_URL found:', process.env.DATABASE_URL.slice(0, 40) + '...')

// ── Import Prisma AFTER env is loaded ────────────────────────────────────────
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// ── Plan data ─────────────────────────────────────────────────────────────────
const PLANS = [
  {
    code: 'starter', name: 'Starter', sortOrder: 1,
    description: 'For small AR teams getting started with automation',
    maxUsers: 10, maxBatches: 200,
    features: ['AI invoice matching', 'SFTP/URL file pickup', 'SAP IDOC & CSV export', 'Email notifications', 'Audit trail', '5 regions', '10 users'],
    prices: [
      { currency: 'AUD', interval: 'month', amount: 9900,   discountPct: 0  },
      { currency: 'AUD', interval: 'year',  amount: 95040,  discountPct: 20 },
      { currency: 'USD', interval: 'month', amount: 6900,   discountPct: 0  },
      { currency: 'USD', interval: 'year',  amount: 66240,  discountPct: 20 },
      { currency: 'NZD', interval: 'month', amount: 11900,  discountPct: 0  },
      { currency: 'NZD', interval: 'year',  amount: 114240, discountPct: 20 },
      { currency: 'GBP', interval: 'month', amount: 4900,   discountPct: 0  },
      { currency: 'GBP', interval: 'year',  amount: 47040,  discountPct: 20 },
      { currency: 'EUR', interval: 'month', amount: 5900,   discountPct: 0  },
      { currency: 'EUR', interval: 'year',  amount: 56640,  discountPct: 20 },
    ],
  },
  {
    code: 'professional', name: 'Professional', sortOrder: 2,
    description: 'For growing AR teams with complex matching needs',
    maxUsers: 50, maxBatches: 2000,
    features: ['Everything in Starter', 'ML learning engine', 'Multi-region routing', 'Dual approval workflows', 'ClickSend SMS alerts', 'Priority support', '50 users'],
    prices: [
      { currency: 'AUD', interval: 'month', amount: 34900,  discountPct: 0  },
      { currency: 'AUD', interval: 'year',  amount: 335040, discountPct: 20 },
      { currency: 'USD', interval: 'month', amount: 24900,  discountPct: 0  },
      { currency: 'USD', interval: 'year',  amount: 239040, discountPct: 20 },
      { currency: 'NZD', interval: 'month', amount: 39900,  discountPct: 0  },
      { currency: 'NZD', interval: 'year',  amount: 383040, discountPct: 20 },
      { currency: 'GBP', interval: 'month', amount: 17900,  discountPct: 0  },
      { currency: 'GBP', interval: 'year',  amount: 171840, discountPct: 20 },
      { currency: 'EUR', interval: 'month', amount: 19900,  discountPct: 0  },
      { currency: 'EUR', interval: 'year',  amount: 191040, discountPct: 20 },
    ],
  },
  {
    code: 'enterprise', name: 'Enterprise', sortOrder: 3,
    description: 'For large organisations with custom requirements',
    maxUsers: 200, maxBatches: 999999,
    features: ['Everything in Professional', 'Custom ERP connectors', 'Dedicated infrastructure', 'SLA guarantee', 'ISO 27001 ready', 'Custom contract', 'Dedicated CSM', '200 users'],
    prices: [
      { currency: 'AUD', interval: 'month', amount: 99900,   discountPct: 0  },
      { currency: 'AUD', interval: 'year',  amount: 959040,  discountPct: 20 },
      { currency: 'USD', interval: 'month', amount: 69900,   discountPct: 0  },
      { currency: 'USD', interval: 'year',  amount: 671040,  discountPct: 20 },
      { currency: 'NZD', interval: 'month', amount: 119900,  discountPct: 0  },
      { currency: 'NZD', interval: 'year',  amount: 1151040, discountPct: 20 },
      { currency: 'GBP', interval: 'month', amount: 49900,   discountPct: 0  },
      { currency: 'GBP', interval: 'year',  amount: 479040,  discountPct: 20 },
      { currency: 'EUR', interval: 'month', amount: 59900,   discountPct: 0  },
      { currency: 'EUR', interval: 'year',  amount: 575040,  discountPct: 20 },
    ],
  },
]

const PROMO_CODES = [
  { code: 'LAUNCH50', discountType: 'percent', discountValue: 50, maxRedemptions: 100, validUntil: new Date('2026-12-31'), planCodes: ['starter', 'professional'] },
  { code: 'HINDLE20', discountType: 'percent', discountValue: 20, maxRedemptions: null, validUntil: null, planCodes: [] },
  { code: 'ANNUAL3M', discountType: 'percent', discountValue: 25, maxRedemptions: 50,  validUntil: new Date('2026-06-30'), planCodes: [] },
]

// ── Seed ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌱 Seeding pricing...\n')

  for (const planData of PLANS) {
    const { prices, ...planFields } = planData

    const plan = await prisma.plan.upsert({
      where: { code: planFields.code },
      update: { ...planFields, features: planFields.features as any },
      create: { ...planFields, active: true, features: planFields.features as any },
    })

    console.log(`✓ Plan: ${plan.name} (${plan.id})`)

    for (const price of prices) {
      await prisma.planPrice.upsert({
        where: { planId_currency_interval: { planId: plan.id, currency: price.currency, interval: price.interval } },
        update: { amount: price.amount, discountPct: price.discountPct },
        create: { planId: plan.id, currency: price.currency, interval: price.interval, amount: price.amount, discountPct: price.discountPct, active: true },
      })
      console.log(`  ${price.currency} ${price.interval.padEnd(5)}: $${(price.amount / 100).toFixed(2)}`)
    }
  }

  console.log('')

  for (const promo of PROMO_CODES) {
    await prisma.promoCode.upsert({
      where: { code: promo.code },
      update: { discountValue: promo.discountValue, maxRedemptions: promo.maxRedemptions, validUntil: promo.validUntil, planCodes: promo.planCodes, active: true },
      create: { code: promo.code, discountType: promo.discountType, discountValue: promo.discountValue, maxRedemptions: promo.maxRedemptions, validUntil: promo.validUntil, planCodes: promo.planCodes, active: true },
    })
    console.log(`✓ Promo: ${promo.code} (${promo.discountValue}% off)`)
  }

  console.log('\n✅ Pricing seed complete!')
  console.log('\nNext: log in as superadmin → /admin → Pricing → Sync to Stripe')
}

main()
  .catch(e => { console.error('Seed failed:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
