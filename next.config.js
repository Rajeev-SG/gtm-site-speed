/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    esmExternals: 'loose',
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  webpack: (config, { isServer }) => {
    // Skip bundling puppeteer-core when compiling the server build to avoid SWC parse errors.
    if (isServer) {
      (config.externals = config.externals || []).push('puppeteer-core', 'lighthouse', 'chrome-launcher');
    }
    return config;
  },
};

module.exports = nextConfig;
