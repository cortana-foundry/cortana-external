import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const missionControlRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(missionControlRoot, "..", "..");

const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
  },
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
