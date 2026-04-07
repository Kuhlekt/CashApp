// src/app/api/serve-app/route.ts
// Serves cashflow-app.html at /api/serve-app — then redirect /app to this
import { NextRequest } from 'next/server'
import { auth } from '../../../lib/auth/config'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return new Response(null, { status: 302, headers: { Location: '/login' } })
  }

  const htmlPath = join(process.cwd(), 'public', 'cashflow-app.html')
  try {
    const html = readFileSync(htmlPath, 'utf-8')
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return new Response(null, { status: 302, headers: { Location: '/login' } })
  }
}
