/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
