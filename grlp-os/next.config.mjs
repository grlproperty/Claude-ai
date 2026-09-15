/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces .next/standalone: a self-contained server with only the packages it
  // actually uses, which keeps the container small and the start-up quick.
  output: 'standalone',
  // Pinned, because Next otherwise infers the root from whatever lockfiles it
  // finds above this directory: with one present in a parent, standalone output
  // lands a directory deeper and `node server.js` cannot find itself. It builds
  // the same way here as it does in the container either way.
  outputFileTracingRoot: import.meta.dirname,
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
};
export default nextConfig;
