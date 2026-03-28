import type { NextConfig } from "next";

const allowedOrigins =
  process.env.SERVER_ACTIONS_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
      ...(allowedOrigins.length > 0 ? { allowedOrigins } : {}),
    },
  },
};

export default nextConfig;
