// scripts/seed.ts
// Explicitly loads .env.local before anything else so tsx can find DATABASE_URL

import { config } from 'fs'
import path from 'path'

// Load .env.local manually — tsx doesn't auto-load it like Next.js does
const envPath = path.resolve(process.cwd(), '.env.local')
const envLocalPath = path.resolve(process.cwd(), '.env')

function loadEnvFile(filePath: string) {
  try {
    const fs = require('fs') as typeof import('fs')
    if (!fs.existsSync(filePath)) return
    const content = fs.readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) {
        process.env[key] = val
      }
    }
    console.log(`✓ Loaded env from ${filePath}`)
  } catch {
    // silently skip
  }
}

// Load env files before importing Prisma
loadEnvFile(envPath)       // .env.local (highest priority)
loadEnvFile(envLocalPath)  // .env (fallback)

// Now import Prisma — it will find DATABASE_URL
import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'

const prisma = new PrismaClient()

async function hashPassword(password: string): Promise<string> {
  try {
    const { hash } = await import('bcryptjs')
    return await hash(password, 12)
  } catch {
    const salt = 'cashflow-salt-2024'
    return createHash('sha256').update(salt + password).digest('hex')
  }
}

async function main() {
  console.log('\n🌱 Seeding CashFlow Platform...\n')

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not found!')
    console.error('   Make sure .env.local exists and contains:')
    console.error('   DATABASE_URL=postgresql://...')
    console.error('')
    console.error('   Current working directory:', process.cwd())
    process.exit(1)
  }

  console.log('✓ DATABASE_URL found:', process.env.DATABASE_URL.slice(0, 40) + '...')

  const org = await prisma.org.upsert({
    where: { slug: 'hindle-consultants' },
    update: {},
    create: {
      name: 'Hindle Consultants',
      slug: 'hindle-consultants',
      plan: 'professional',
      status: 'active',
      mrr: 349,
    },
  })
  console.log(`✓ Org: ${org.name} (${org.id})`)

  const adminHash = await hashPassword('CashFlow2024!')
  const admin = await prisma.user.upsert({
    where: { email: 'admin@hindleconsultants.com.au' },
    update: {},
    create: {
      orgId: org.id,
      email: 'admin@hindleconsultants.com.au',
      name: 'Ian Hindle',
      initials: 'IH',
      role: 'admin',
      level: 'L4',
      status: 'active',
      passwordHash: adminHash,
    },
  })
  console.log(`✓ Admin: ${admin.email}`)

  const ctrlHash = await hashPassword('Controller2024!')
  await prisma.user.upsert({
    where: { email: 'controller@hindleconsultants.com.au' },
    update: {},
    create: {
      orgId: org.id,
      email: 'controller@hindleconsultants.com.au',
      name: 'A. Mitchell',
      initials: 'AM',
      role: 'controller',
      level: 'L3',
      status: 'active',
      passwordHash: ctrlHash,
    },
  })
  console.log(`✓ Controller: controller@hindleconsultants.com.au`)

  await prisma.govRules.upsert({
    where: { orgId: org.id },
    update: {},
    create: {
      orgId: org.id,
      minConfidence: 85,
      requireApproval: 50000,
      dualApproval: true,
      hashVerify: true,
      autoArchive: true,
      retentionDays: 2555,
      flagPartial: true,
      maxExceptionAge: 5,
      erpApproval: true,
    },
  })
  console.log('✓ Governance rules')

  const codes = [
    { code: 'DISC', label: 'Early Payment Discount', type: 'variance' },
    { code: 'DAMT', label: 'Damaged Goods Deduction', type: 'variance' },
    { code: 'TEXP', label: 'Tax / GST Adjustment', type: 'variance' },
    { code: 'RTRN', label: 'Return / Credit Note', type: 'variance' },
    { code: 'FX',   label: 'FX / Currency Rounding', type: 'variance' },
    { code: 'UNKN', label: 'Unknown — Investigate', type: 'variance' },
    { code: 'UNID', label: 'Unidentified Payment', type: 'on-account' },
    { code: 'ADV',  label: 'Advance Payment', type: 'on-account' },
    { code: 'OVER', label: 'Overpayment', type: 'on-account' },
    { code: 'PEND', label: 'Pending Invoice Match', type: 'on-account' },
    { code: 'DISP', label: 'Disputed Amount', type: 'on-account' },
  ]
  for (const c of codes) {
    await prisma.reasonCode.upsert({
      where: { orgId_code_type: { orgId: org.id, code: c.code, type: c.type } },
      update: {},
      create: { orgId: org.id, ...c },
    })
  }
  console.log(`✓ ${codes.length} reason codes`)

  await prisma.automationConfig.upsert({
    where: { orgId: org.id },
    update: {},
    create: {
      orgId: org.id,
      enabled: false,
      frequency: 'weekdays',
      runTime: '06:00',
      timezone: 'Australia/Sydney',
      batchOpenAction: 'suspend',
      timeoutMin: 30,
      mlAutoThresh: 0.92,
      mlAiThresh: 0.75,
      aiEnabled: true,
      aiModel: 'claude-sonnet-4-20250514',
      aiMaxCallsPerRun: 200,
      haltAtExceptions: true,
      autoApprove: false,
      autoOutput: true,
      notifyOnComplete: true,
      outputFormat: 'sap-idoc',
      outputFilename: 'CASHAPP_{date}_{region}_{seq}.txt',
      outputLocalCopy: true,
    },
  })
  console.log('✓ Automation config')

  const regions = [
    { code: 'AU-NSW', name: 'Australia — NSW', currency: 'AUD' },
    { code: 'AU-VIC', name: 'Australia — VIC', currency: 'AUD' },
    { code: 'AU-QLD', name: 'Australia — QLD', currency: 'AUD' },
    { code: 'AU-WA',  name: 'Australia — WA',  currency: 'AUD' },
    { code: 'NZ',     name: 'New Zealand',      currency: 'NZD' },
  ]
  for (const r of regions) {
    await prisma.region.upsert({
      where: { orgId_code: { orgId: org.id, code: r.code } },
      update: {},
      create: { orgId: org.id, ...r },
    })
  }
  console.log(`✓ ${regions.length} regions`)

  await prisma.notificationConfig.upsert({
    where: { orgId: org.id },
    update: {},
    create: {
      orgId: org.id,
      enabled: false,
      provider: 'clicksend',
      fromName: 'CashFlow AI',
      onBatchComplete: true,
      onException: true,
      onApproval: true,
      onErpExport: true,
    },
  })
  console.log('✓ Notification config')

  console.log('\n✅ Seed complete!')
  console.log('\n📋 Login at http://localhost:3000/login')
  console.log('   admin@hindleconsultants.com.au  /  CashFlow2024!')
  console.log('   controller@hindleconsultants.com.au  /  Controller2024!')
}

main()
  .catch(e => { console.error('\n❌ Seed failed:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
