import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = [
  '/login', '/signup', '/landing', '/reset-password', '/accept-invite',
  '/api/auth', '/api/health', '/api/orgs', '/api/billing/webhook', '/api/claude',
  '/cashflow-app.html', '/_next', '/favicon.ico',
]

const API_KEY_PATHS = ['/api/accounts', '/api/openitems', '/api/allocations', '/api/batch']

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (PUBLIC_PATHS.some(p => path.startsWith(p))) return NextResponse.next()

  // API key auth for integration endpoints
  if (API_KEY_PATHS.some(p => path.startsWith(p))) {
    const apiKey = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace('Bearer ', '')
    if (apiKey?.startsWith('cfa_')) return NextResponse.next()
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$).*)'],
}
