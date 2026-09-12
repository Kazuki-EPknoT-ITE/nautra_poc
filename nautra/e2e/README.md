# e2e — ブラウザでの検証スクリプト

本番ビルドでアプリを起動した状態で実行する。`e2e.config.json` の `playwrightTest` から参照している。

```bash
# 1) アプリを起動（別のターミナルで）
npm run preview          # = next build && next start -p 3100

# 2) 初回だけ依存を入れる
cd e2e
npm install playwright@1.62.1 --no-save
npx playwright install chromium

# 3) 実行
node e2e-check.mjs
node e2e-flow.mjs
node e2e-documents.mjs
```

| スクリプト | 何を見るか |
|---|---|
| `e2e-check.mjs` | 全40画面を巡回し、**HTTPステータスとコンソールエラー**を検査する。ハイドレーション不整合（React error #418）はここで出る |
| `e2e-flow.mjs` | **主要フローを実際に操作**する。船内で記録 → 同期 → 陸上に届くところまで通す |
| `e2e-documents.mjs` | **法定帳票の生成**（海員名簿・一括届出許可申請書・操練実施記録）と印刷ビューの描画を確かめる |
| `measure.mjs` | 全画面の描画後の**高さと横スクロール**を測る。一覧を全件出している画面はここで見つかる |
| `perf.mjs` | **押してから中身が出るまで**と初回表示を測る。必ず `npm run preview`（本番ビルド）に対して実行する（開発サーバはその場でコンパイルするため実装の速さが分からない） |
| `scan-nesting.mjs` | サーバが返した HTML に **`<p>` の中に置けない要素**が無いか走査する。`div` を描く部品（HeroUI の `Chip`・`Card`）を `<p>` に入れるとハイドレーションが必ず壊れるための検出用 |
| `shot.mjs` / `shot-vessel.mjs` / `shot-docs.mjs` | 主要画面のスクリーンショットを `shots/` に保存する（`.gitignore` 済み） |

## サインインの扱い

- **陸上**はサインイン必須。スクリプトは Cookie `nautra_shore_session` に `shore-yamaguchi`（管理者）を
  入れて開いている。ロール別の見え方を試すときは値を差し替える:
  `shore-taniguchi`（労務管理責任者）/ `shore-shiraishi`（労務担当）/ `shore-fujii`（運航担当）/
  `shore-okamoto`（経理・事務）。画面から入るときは `/shore/login` でメール + パスワード
  （デモは全員 `nautra-demo`）。
- **船内**は PIN でサインインする（スクリプトが自動で入力する。中原 = `3333`。
  PIN は船員ごとに違う: 高松 1111 / 寺田 2222 / 中原 3333 / 大城 4444）

## 注意

- **必ず本番ビルドで確認する**。開発サーバは画面ごとにオンデマンドでコンパイルするため、
  遅さの原因を取り違えるうえ、Service Worker が入らない。
- デモデータを作り直したいときは `.data/store.json` を消して再起動する。
