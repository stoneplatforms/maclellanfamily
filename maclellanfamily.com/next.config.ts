import { NextConfig } from 'next'

const config: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    typedRoutes: false,
  },
  // Dropbox webhook verification GET must return 200 + challenge. Next.js otherwise
  // 308-redirects /api/dropbox/webhook/ -> /api/dropbox/webhook and Dropbox does not follow redirects.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/dropbox/webhook/',
          destination: '/api/dropbox/webhook',
        },
      ],
    }
  },
}

export default config