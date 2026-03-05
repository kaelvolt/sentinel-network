/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@kael/shared', '@kael/core'],
  experimental: {
    typedRoutes: true,
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
