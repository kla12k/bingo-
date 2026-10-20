/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@prisma/client"],
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/v2/:path*", destination: "/api/:path*" },
      ],
    };
  },
};

export default nextConfig;
