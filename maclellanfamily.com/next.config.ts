import { NextConfig } from 'next'

const config: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    typedRoutes: false,
  }
}

export default config