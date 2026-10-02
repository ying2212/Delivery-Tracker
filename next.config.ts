import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Large CSV imports are sent to the server as one request.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
