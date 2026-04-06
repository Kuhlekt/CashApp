// src/middleware.ts - Production auth middleware
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

const PUBLIC_PATHS = [
  '/login', '/signup', '/landing', '/reset-password', '/accept-invite',
  '/api/auth', '/api/health', '/api/orgs', '/api/billing/webhook',
  '/cashflow-app.html', '/_next', '/favicon.ico',
]

// API routes that accept API key auth
const API_KEY_PATHS = ['/api/accounts', '/api/openitems', '/api/allocations', '/api/batch']

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // Always allow public paths
  if (PUBLIC_PATHS.some(p => path.startsWith(p))) return NextResponse.next()

  // Check API key auth for integration endpoints
  if (API_KEY_PATHS.some(p => path.startsWith(p))) {
    const apiKey = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace('Bearer ', '')
    if (apiKey?.startsWith('cfa_')) {
      // Key format valid — route handler will verify against org settings
      return NextResponse.next()
    }
  }

  // JWT session check
  const token =
    req.cookies.get('authjs.session-token')?.value ??
    req.cookies.get('next-auth.session-token')?.value ??
    req.cookies.get('__Secure-authjs.session-token')?.value

  if (!token) {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = new URL('/login', req.url)
    url.searchParams.set('callbackUrl', path)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)'],
}
