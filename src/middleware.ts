import { NextRequest, NextResponse } from "next/server"

const PUBLIC = ["/login", "/api/auth", "/api/claude", "/api/health", "/cashflow-app.html", "/_next", "/favicon.ico"]

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (PUBLIC.some(p => path.startsWith(p))) return NextResponse.next()
  const token = req.cookies.get("authjs.session-token")?.value ?? req.cookies.get("next-auth.session-token")?.value
  if (!token) return NextResponse.redirect(new URL("/login", req.url))
  return NextResponse.next()
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] }
