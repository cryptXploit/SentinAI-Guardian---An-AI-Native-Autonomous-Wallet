import os from "os";
import type { NextConfig } from "next";

function getLocalDevOrigins(): string[] {
  const origins = new Set<string>(["localhost", "127.0.0.1", "192.168.1.101", "192.168.110.242"]);
  try {
    const interfaces = os.networkInterfaces();
    for (const list of Object.values(interfaces)) {
      for (const iface of list || []) {
        if (iface.family === "IPv4" && iface.address) {
          origins.add(iface.address);
        }
      }
    }
  } catch {
    // Fallback to static list
  }
  return Array.from(origins);
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: getLocalDevOrigins(),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
