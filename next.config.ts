import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  experimental: { serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"] },
};
export default nextConfig;
