/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    /**
     * HeroUI は 1 パッケージから多数のコンポーネントを再エクスポートするため、
     * そのまま import すると開発ビルドでモジュール数が膨らみ初回表示が遅くなる。
     * 実際に使うコンポーネントだけを解決させる（本番の bundle も小さくなる）。
     */
    optimizePackageImports: ["@heroui/react"],
  },
};

export default nextConfig;
