import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Clients' printed QR codes (/q/<code>): the backend decides where they lead.
  async rewrites() {
    let api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
    while (api.endsWith("/")) api = api.slice(0, -1);
    return [{ source: "/q/:code", destination: `${api}/api/qr/:code` }];
  },
};

export default nextConfig;
