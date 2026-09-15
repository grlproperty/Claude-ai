/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces .next/standalone: a self-contained server with only the packages it
  // actually uses, which keeps the container small and the start-up quick.
  output: 'standalone',
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
};
export default nextConfig;
