import type { NextConfig } from "next";

// The browser only ever talks to this app's own origin. /v1 and /media are proxied to the API, so the
// admin session cookie (httpOnly, SameSite=Strict, Path=/v1/admin) works without cross-site cookies.
const API_ORIGIN = process.env.KLEAWIP_API_ORIGIN ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@kleawip/contract"],
  async rewrites() {
    return [
      { source: "/v1/:path*", destination: `${API_ORIGIN}/v1/:path*` },
      { source: "/media/:path*", destination: `${API_ORIGIN}/media/:path*` },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "X-Frame-Options", value: "DENY" }] }];
  },
};

export default nextConfig;
