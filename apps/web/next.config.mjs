/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@kael/shared', '@kael/core'],
  experimental: {
    typedRoutes: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
