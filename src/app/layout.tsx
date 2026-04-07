import type { Metadata } from 'next'
import './globals.css'
import { SessionProvider } from 'next-auth/react'

export const metadata: Metadata = {
  title: 'CashFlow AI',
  description: 'Governed Cash Application Platform by Hindle Consultants',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#020817', color: '#e2e8f0', fontFamily: 'system-ui,sans-serif' }}>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
