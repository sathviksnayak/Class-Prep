import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist resolves its worker relative to its installed package. Keep
  // pdf-parse out of Next's SSR chunk graph so that resolution remains valid
  // in both dev and production Node runtimes.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  experimental: {
    proxyClientMaxBodySize: "22mb",
    serverActions: {
      bodySizeLimit: "22mb",
    },
  },
};

export default nextConfig;
