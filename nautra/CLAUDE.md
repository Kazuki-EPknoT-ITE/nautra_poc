# Nautra PoC — 開発規約（基本設計書 13.2 の PoC 適用版）

このアプリは `projects/docs/` の要件定義書・基本設計書 Ver1.2 を正本とする PoC。
スコープ: Phase 1 船内画面 V-01〜V-09（打刻・履歴・本日の集計・船内承認・航海日誌・
チェックリスト/点検・作業/待機/燃料/引継・シフト/配置表・同期状態）＋ 日常点検・保守記録
＋ 陸上 S-01（労務ダッシュボード）/ S-10（シフト変更配信）簡易版。

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

## テスト方針

- 法令判定の変更はテーブル駆動テストの更新とセット（テスト名に条文・数値を使う）
- 同期ロジックの変更は冪等・再送・隔離のテスト追加とセット
- レビューは `.claude/agents/` の **law-checker** / **sync-reviewer** サブエージェントを使用

## PoC の簡略化（本番との差分）

- DB: Supabase PostgreSQL → JSON ファイル（`.data/store.json`）＋ IndexedDB
  - デモデータ版（`SEED_VERSION`）が上がるとストアを作り直す（旧ファイルは退避）。
    船内端末は Pull 応答の `storeId` 変化を検知してレプリカを取り直す（未送信 outbox は保持）
- 認証・RBAC・RLS・テナント分離: 未実装（デモ用固定テナント。打刻者・記録者は選択方式）
- Service Worker（Serwist）/ PWA: 未実装（擬似オフライントグルで通信断を再現）
- 帳票生成（第16号の5書式）・Cloud Run Jobs・fast-check プロパティテスト: 未実装
- チェックリストテンプレートは定数（本番はテナント定義・版管理テーブル）
- シフトの新規作成・配置表編集・通知のプッシュ配信は未実装（既存シフトの変更配信のみ）
- 保守計画・部品在庫・入渠（S-11）、相談・アンケート（V-10）は未実装
