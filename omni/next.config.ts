import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone keeps the production image small; the worker runs as a separate process.
  output: "standalone",
  serverExternalPackages: ["pg", "pg-boss", "@node-rs/argon2"],
};

export default nextConfig;
