import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
