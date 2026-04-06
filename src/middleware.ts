// src/middleware.ts — pass everything through, no auth blocking
import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [],  // match nothing — middleware effectively disabled
}
