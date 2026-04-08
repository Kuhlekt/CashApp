// scripts/seed-pricing.ts
import * as fs from 'fs'
import * as path from 'path'

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = path.resolve(process.cwd(), file)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq < 0) continue
      const key = t.slice(0, eq).trim()
      let val = t.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
      if (!process.env[key]) process.env[key] = val
    }
    break
  }
}
loadEnv()

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set.')
  console.error('   Run: $env:DATABASE_URL="postgresql://..."')
  process.exit(1)
}
console.log('✓ DATABASE_URL:', process.env.DATABASE_URL.slice(0, 45) + '...')

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// ── FX multipliers (1 USD = X local currency), rounded to nearest $5
const FX: Record<string, number> = { USD: 1, AUD: 1.55, NZD: 1.65, GBP: 0.78, EUR: 0.92 }
const ANNUAL_DISCOUNT = 0.20 // 20% off annual

// Round to nearest $5 in local currency
function toPrice(usdMonthly: number, currency: string, annual = false): number {
  const local = usdMonthly * FX[currency]
  const discounted = annual ? local * (1 - ANNUAL_DISCOUNT) : local
  // Round to nearest 5
  const rounded = Math.round(discounted / 5) * 5
  // Convert to cents
  return rounded * 100
}

// USD base prices (monthly)
const USD_BASE: Record<string, number> = {
  starter: 69,      // $69 USD/mo
  professional: 249, // $249 USD/mo
  enterprise: 699,   // $699 USD/mo
}

const PLAN_CONFIGS = [
  {
    code: 'starter', name: 'Starter', sortOrder: 1,
    description: 'For small AR teams getting started with automation',
    maxUsers: 10, maxBatches: 200,
    baseUsdMonth: USD_BASE.starter * 100,
    baseUsdYear: Math.round(USD_BASE.starter * (1 - ANNUAL_DISCOUNT) * 12) * 100,
    features: ['AI invoice matching', 'SFTP/URL file pickup', 'SAP IDOC & CSV export', 'Email notifications', 'Audit trail', '5 regions', '10 users'],
  },
  {
    code: 'professional', name: 'Professional', sortOrder: 2,
    description: 'For growing AR teams with complex matching needs',
    maxUsers: 50, maxBatches: 2000,
    baseUsdMonth: USD_BASE.professional * 100,
    baseUsdYear: Math.round(USD_BASE.professional * (1 - ANNUAL_DISCOUNT) * 12) * 100,
    features: ['Everything in Starter', 'ML learning engine', 'Multi-region routing', 'Dual approval workflows', 'ClickSend SMS alerts', 'Priority support', '50 users'],
  },
  {
    code: 'enterprise', name: 'Enterprise', sortOrder: 3,
    description: 'For large organisations with custom requirements',
    maxUsers: 200, maxBatches: 999999,
    baseUsdMonth: USD_BASE.enterprise * 100,
    baseUsdYear: Math.round(USD_BASE.enterprise * (1 - ANNUAL_DISCOUNT) * 12) * 100,
    features: ['Everything in Professional', 'Custom ERP connectors', 'Dedicated infrastructure', 'SLA guarantee', 'ISO 27001 ready', 'Custom contract', '200 users'],
  },
]

const PROMO_CODES = [
  { code: 'LAUNCH50', discountType: 'percent', discountValue: 50, maxRedemptions: 100, validUntil: new Date('2026-12-31'), planCodes: ['starter', 'professional'] },
  { code: 'HINDLE20', discountType: 'percent', discountValue: 20, maxRedemptions: null, validUntil: null, planCodes: [] },
  { code: 'ANNUAL3M', discountType: 'percent', discountValue: 25, maxRedemptions: 50,  validUntil: new Date('2026-06-30'), planCodes: [] },
]

async function main() {
  console.log('\n🌱 Seeding pricing...\n')

  for (const cfg of PLAN_CONFIGS) {
    const plan = await prisma.plan.upsert({
      where: { code: cfg.code },
      update: { name: cfg.name, description: cfg.description, maxUsers: cfg.maxUsers, maxBatches: cfg.maxBatches, baseUsdMonth: cfg.baseUsdMonth, baseUsdYear: cfg.baseUsdYear, annualDiscountPct: 20, features: cfg.features as any, active: true },
      create: { code: cfg.code, name: cfg.name, description: cfg.description, sortOrder: cfg.sortOrder, maxUsers: cfg.maxUsers, maxBatches: cfg.maxBatches, baseUsdMonth: cfg.baseUsdMonth, baseUsdYear: cfg.baseUsdYear, annualDiscountPct: 20, features: cfg.features as any, active: true },
    })
    console.log(`✓ Plan: ${plan.name}`)

    for (const currency of ['USD', 'AUD', 'NZD', 'GBP', 'EUR']) {
      const monthAmount = toPrice(USD_BASE[cfg.code], currency, false)
      const yearAmount  = toPrice(USD_BASE[cfg.code], currency, true) * 12 // annual total

      for (const [interval, amount] of [['month', monthAmount], ['year', yearAmount]] as [string, number][]) {
        await prisma.planPrice.upsert({
          where: { planId_currency_interval: { planId: plan.id, currency, interval } },
          update: { amount, discountPct: interval === 'year' ? 20 : 0, active: true },
          create: { planId: plan.id, currency, interval, amount, discountPct: interval === 'year' ? 20 : 0, active: true },
        })
        const sym = { USD:'$', AUD:'A$', NZD:'NZ$', GBP:'£', EUR:'€' }[currency]
        console.log(`  ${currency} ${interval.padEnd(5)}: ${sym}${(amount/100).toFixed(0)}${interval === 'year' ? '/yr' : '/mo'}`)
      }
    }
    console.log('')
  }

  for (const promo of PROMO_CODES) {
    await prisma.promoCode.upsert({
      where: { code: promo.code },
      update: { discountValue: promo.discountValue, active: true },
      create: { ...promo, active: true },
    })
    console.log(`✓ Promo: ${promo.code} (${promo.discountValue}% off)`)
  }

  console.log('\n✅ Pricing seed complete!')
  console.log('\nNext step: /admin → Pricing → Sync to Stripe')
}

main()
  .catch(e => { console.error('Seed failed:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
