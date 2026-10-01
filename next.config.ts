import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: "22mb",
    serverActions: {
      bodySizeLimit: "22mb",
    },
  },
};

export default nextConfig;
