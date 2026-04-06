// src/app/api/cron/trial-expiry/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '../../../../lib/db/client'
import { sendTrialExpiryEmail } from '../../../../lib/clicksend/transactional'

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const results = { warned: 0, suspended: 0, errors: 0, checked: 0 }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cash-app-three-iota.vercel.app'

  const trialOrgs = await prisma.org.findMany({
    where: { status: 'trial', trialEndsAt: { not: null } },
    include: { users: { where: { role: 'admin', status: 'active' }, select: { email: true, name: true }, take: 1 } },
  })

  results.checked = trialOrgs.length

  for (const org of trialOrgs) {
    try {
      if (!org.trialEndsAt) continue
      const daysLeft = Math.ceil((org.trialEndsAt.getTime() - now.getTime()) / 86400000)
      const admin = org.users[0]

      if (daysLeft <= 0) {
        await prisma.org.update({ where: { id: org.id }, data: { status: 'suspended' } })
        results.suspended++
        continue
      }

      if ([7, 3, 1].includes(daysLeft) && admin) {
        await sendTrialExpiryEmail({
          to: admin.email, toName: admin.name, orgName: org.name,
          daysLeft, upgradeUrl: `${appUrl}/cashflow-app.html`,
        })
        results.warned++
      }
    } catch (err) {
      results.errors++
    }
  }

  return NextResponse.json({ ok: true, ...results })
}
