/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * **開発と本番で出力先を分ける。**
   *
   * 既定ではどちらも `.next` に書くため、`npm run dev` を動かしたまま `npm run build` を
   * 走らせる（またはその逆）と、同じファイルに新旧の成果物が混ざる。その状態で開くと
   * サーバが返した HTML と手元の JS が食い違い、**ハイドレーション不一致**になる
   * （「A tree hydrated but some attributes ... didn't match」。実際に発生した）。
   * 出力先を分けておけば、両方を同時に使っても壊れない。
   *
   * `next dev` は NODE_ENV=development、`next build` / `next start` は production を
   * 設定してから設定ファイルを読むので、この分岐でそれぞれの出力先になる。
   */
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  /**
   * ビルドごとに変わる識別子。Service Worker の登録先 `/sw.js?v=<これ>` に付け、
   * ビルドし直したら古いキャッシュが確実に捨てられるようにする（public/sw.js）。
   * クライアントの JS にはビルド時の値が埋め込まれる。
   */
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID ?? `${Date.now().toString(36)}`,
  },
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
