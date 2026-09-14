import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

/**
 * Security headers are set here rather than in a proxy so that a self-hosted
 * deployment gets them regardless of what sits in front of the app.
 */
const config: NextConfig = {
  /**
   * A self-contained server bundle, so a deployment copies one directory
   * instead of the whole of node_modules. This is what makes the Docker
   * image small and the upload quick.
   */
  output: 'standalone',
  /**
   * Pinned to this directory. Without it Next traces from whichever parent
   * happens to hold a lockfile and nests the bundle under an extra folder,
   * so the same build lands in two different shapes depending on what is
   * above it on disk — and the deployment then works in one place and not
   * the other.
   */
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['pg', 'exceljs'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default config;
