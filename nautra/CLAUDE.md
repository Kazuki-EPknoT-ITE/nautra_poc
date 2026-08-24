# Nautra PoC — 開発規約（基本設計書 13.2 の PoC 適用版）

このアプリは `projects/docs/` の要件定義書・基本設計書 Ver1.2 を正本とする PoC。
スコープ: Phase 1 船内画面 V-01〜V-09（打刻・履歴・本日の集計・船内承認・航海日誌・
チェックリスト/点検・作業/待機/燃料/引継・シフト/配置表・同期状態）＋ 日常点検・保守記録
＋ 陸上 S-01（労務ダッシュボード）/ S-10（シフト変更配信）簡易版。
デザインは白ベース＋リキッドガラス（後述の「デザイン」節）。

## コマンド

- `npm run dev` — 開発サーバ（http://localhost:3100）
- `npm run test` — Vitest（ドメイン・同期のテーブル駆動テスト）
- `npm run typecheck` — tsc --noEmit
- `npm run build` — 本番ビルド

## ディレクトリ（本番モノレポの packages/ 相当を src/ 配下で表現）

- `src/domain/labor-law/` — 法令判定の純関数（UI・DB・fetch 依存禁止）
- `src/rules/` — rule_sets / rule_values 相当（労働時間・休息・安全基準の版管理データ）
- `src/sync-protocol/` — 同期イベント Zod スキーマ（`records.ts` = 船内記録・シフト計画）、
  エンティティレジストリ（`events.ts` の `SYNC_ENTITY_REGISTRY`）、冪等キー・競合解決純関数
- `src/ui/` — HeroUI ラッパー（packages/ui 相当）
- `src/lib/` — 船内クライアント（Dexie/IndexedDB・同期クライアント・チェックリスト定義・シード）
- `src/server/` — 陸上側ストア・ドメインサービス（labor / shift。PoC: JSON ファイル永続化）
- `src/app/(vessel)/` — 船内画面 / `src/app/(shore)/` — 陸上画面 / `src/app/api/` — REST API

## ガードレール（違反コードを書かない・見つけたら直す）

1. `(vessel)` 配下で Server Components のデータ取得禁止（オフライン破壊防止）
2. 一次記録（timeRecords / records / サーバ events）への UPDATE/DELETE 禁止。訂正は差戻し→
   `supersedesId` 付き新規レコード（航海日誌・シフト計画も同じ規則。`latestBySupersedes`）
3. 法令閾値（14h/72h/休息10h 等）・安全基準（アルコール 0.15mg/L）をドメイン関数や画面内の
   定数として持つこと禁止。`src/rules/` から引数注入し、判定結果に適用版を記録する
4. 導出値（年齢・配乗可否・集計値）を入力カラムとして保持しない
5. HeroUI の直接 import は `src/ui/` 配下のみ。画面は `@/ui` 経由で使用
6. 製品名は `src/i18n/ja.ts` の `PRODUCT_NAME` からのみ参照（ハードコード禁止）
7. `(vessel)` ⇔ `(shore)` の相互 import 禁止（共有は src/domain・src/ui 等経由）
8. 同期イベントは冪等キー必須。未知種別は破棄せず隔離（quarantine）
9. **新しい記録種別の追加は `src/sync-protocol/records.ts` にスキーマを定義し
   `SYNC_ENTITY_REGISTRY` に登録するだけ**で完了させる。種別ごとに Push/Pull・Dexie
   テーブル・適用処理を個別実装しない（汎用 `records` テーブル + `appendRecord`）
10. シフト・配乗計画は陸上正本（船内は参照のみ）。船内の実績は打刻等の別レコードで保持し、
    計画を実績で上書きしない

## デザイン（リキッドガラス・白黒基調）

- 基調色は**白黒（モノクローム）**。**船内・陸上ともに白ベース**で、primary は黒。押せる面と
  情報面は塗り・枠線・コントラスト差で区別し、色相で意味を作らない。
- 例外として **success / warning / danger は保持**する（法令遵守の2段階アラート・判定表示。
  要件定義書 3.2.5）。アイコンと文言を必ず併記し、色だけに依存しない。
- 材質は `src/app/globals.css` に集約（`.glass-tile` / `.glass-row` / `.glass-inset` /
  `.glass-bar` / `.glass-modal` / `.glass-blur`）。画面は独自スタイルを持たない（6.3）。
  - ヘアラインは `box-shadow` の内側リングで描く（`border` は画面側の強調枠に空けておく）
  - `backdrop-filter` は**背後を内容が通過する面のみ**（ヘッダ・モーダル・主要カード）。
    一覧行は半透明のみでぼかさない（描画コスト対策）
  - `prefers-reduced-transparency` / `prefers-contrast` / 非対応環境では不透明にフォールバック
- ガラスの CSS 変数は `:root` にも既定値を置く。HeroUI のモーダルはポータルに描画され、
  テーマクラス配下から外れるため。加えて `useGlassModalProps()` で `portalContainer` に
  `.app-shell` を指定し、テーマ配色（白黒）をモーダル内にも効かせる。
- 副次テキストは `text-foreground-600`（白地で 7.6:1）。`text-warning` は白地で不足するため
  文字色には `text-warning-700` を使う（チップの flat は HeroUI 側で担保）。
  検証値: 見出し 19.3:1 / 副次 7.6:1 / 主ボタン 17.6:1。
- カードは「タイトル＋操作ボタン」のみとし、説明文は置かない（入口・機能メニュー）。
  状態は通知があるときだけバッジで示す。

## テスト方針

- 法令判定の変更はテーブル駆動テストの更新とセット（テスト名に条文・数値を使う）
- 同期ロジックの変更は冪等・再送・隔離のテスト追加とセット
- レビューは `.claude/agents/` の **law-checker** / **sync-reviewer** サブエージェントを使用

## PoC の簡略化（本番との差分）

- DB: Supabase PostgreSQL → JSON ファイル（`.data/store.json`）＋ IndexedDB
  - デモデータ版（`SEED_VERSION`）が上がるとストアを作り直す（旧ファイルは退避）。
    船内端末は Pull 応答の `storeId` 変化を検知してレプリカを取り直す。旧レプリカは削除せず
    `replicaArchive` に退避し、未送信 outbox は保持する（一次記録を失わない）
- 競合ポリシーの適用: レジストリの `origin=shore`（シフト計画）を船内端末から Push した場合は
  サーバで隔離（`checkOriginPolicy`）。supersedes の分岐は `findSupersedeConflicts` で双方保持のまま
  「競合（要確認）」として V-09 / S-01 に件数表示（自動解決しない）
- 端末側の未知種別は `quarantine` テーブルへローカル隔離（破棄しない）。同期クライアントの
  IndexedDB 単体テスト・fast-check プロパティテストは未実装（要 fake-indexeddb 導入）
- 認証・RBAC・RLS・テナント分離: 未実装（デモ用固定テナント。打刻者・記録者は選択方式）
- Service Worker（Serwist）/ PWA: 未実装（擬似オフライントグルで通信断を再現）
- 帳票生成（第16号の5書式）・Cloud Run Jobs・fast-check プロパティテスト: 未実装
- チェックリストテンプレートは定数（本番はテナント定義・版管理テーブル）
- シフトの新規作成・配置表編集・通知のプッシュ配信は未実装（既存シフトの変更配信のみ）
- 保守計画・部品在庫・入渠（S-11）、相談・アンケート（V-10）は未実装
