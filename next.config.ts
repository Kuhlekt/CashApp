import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'ssh2-sftp-client'],
}

export default nextConfig
