import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables compile-time type-checking of route strings
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
