/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next.js 15 でも serverActions の設定キーは experimental 配下のまま
    // (node_modules/next/dist/server/config-schema.js 参照)。
    // トップレベルに置くと無視され、既定の 1MB 上限に戻ってしまう。
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
