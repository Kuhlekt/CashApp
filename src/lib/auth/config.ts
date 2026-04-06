// src/lib/auth/config.ts
// Simple auth — works with OR without a database
// Hardcoded dev credentials always work for local development

import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

// ─── DEV USERS — always work locally ─────────────────────────────────────────
const DEV_USERS = [
  {
    id: 'user-1',
    email: 'admin@hindleconsultants.com.au',
    password: 'CashFlow2024!',
    name: 'Ian Hindle',
    initials: 'IH',
    orgId: 'org-1',
    orgName: 'Hindle Consultants',
    role: 'admin',
    level: 'L4',
  },
  {
    id: 'user-2',
    email: 'ian@kuhlekt.com',
    password: 'CashFlow2024!',
    name: 'Ian Hindle',
    initials: 'IH',
    orgId: 'org-1',
    orgName: 'Kuhlekt',
    role: 'admin',
    level: 'L4',
  },
]

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  secret: process.env.AUTH_SECRET ?? 'dev-secret-cashflow-2024-local-only',
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string ?? '').toLowerCase().trim()
        const password = credentials?.password as string ?? ''

        if (!email || !password) return null

        // 1. Check hardcoded dev users first — always works
        const devUser = DEV_USERS.find(
          u => u.email.toLowerCase() === email && u.password === password
        )
        if (devUser) {
          const { password: _, ...user } = devUser
          return user
        }

        // 2. Try database if DATABASE_URL is configured
        if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('YOUR_PASSWORD')) {
          try {
            const { default: prisma } = await import('../db/client')
            const { compare } = await import('bcryptjs')

            const user = await prisma.user.findUnique({
              where: { email },
              include: { org: { select: { id: true, name: true } } },
            })

            if (user?.passwordHash && await compare(password, user.passwordHash)) {
              return {
                id: user.id,
                email: user.email,
                name: user.name,
                initials: user.initials,
                orgId: user.orgId,
                orgName: user.org.name,
                role: user.role,
                level: user.level,
              }
            }
          } catch (err) {
            // DB failed — fall through, dev users already checked above
            console.warn('DB auth failed, using dev users only:', (err as Error).message)
          }
        }

        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as Record<string, string>
        token.id = u.id
        token.orgId = u.orgId
        token.orgName = u.orgName
        token.role = u.role
        token.level = u.level
        token.initials = u.initials
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id as string
      session.user.orgId = token.orgId as string
      session.user.orgName = token.orgName as string
      session.user.role = token.role as string
      session.user.level = token.level as string
      return session
    },
  },
})

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      orgId: string
      orgName: string
      role: string
      level: string
    }
  }
}
