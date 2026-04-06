// next.config.ts
import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  // Fix workspace root detection when there's a stray package-lock.json higher up
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        process.env.NEXT_PUBLIC_APP_URL ?? '',
      ],
    },
  },
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
}

export default nextConfig
