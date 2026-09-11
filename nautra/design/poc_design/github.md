repo: Kazuki-EPknoT-ITE/nautra_poc
branch: main
path: nautra/

## Last sync
date: 2026-09-04T07:01:57Z

### Updated in this project
- 船内サインイン画面を vessel/login/page.tsx に合わせて作り直し（1.自分を選ぶ → 2.PIN 4桁、船員は全員グリッド表示）
- PINを船員ごとに設定し、4桁目で自動照合。誤入力はPINをクリアして再入力（試行回数の表示は削除）
- 顔・指紋（任意登録）の導線と、放置による自動サインアウト＋⏱理由メッセージを追加
- 配乗ボードのドラッグ＆ドロップ、船員写真枠（カルテは実写投入可）を追加

## Screen map
| 本プロジェクトの画面 | リポジトリの参照元 |
|---|---|
| 陸上シェル（サイドバー・ヘッダ） | nautra/src/app/(shore)/shore/layout.tsx |
| S-01 ダッシュボード | nautra/src/app/(shore)/shore/page.tsx |
| S-02 船員一覧 | nautra/src/app/(shore)/shore/crew/page.tsx |
| S-03 船員カルテ | nautra/src/app/(shore)/shore/crew/[id]/page.tsx |
| S-05 配乗計画ボード | nautra/src/app/(shore)/shore/manning/page.tsx |
| S-06 労務管理（承認・記録簿） | nautra/src/app/(shore)/shore/labor/page.tsx |
| S-07 届出ウィザード | nautra/src/app/(shore)/shore/filings/_components/filing-wizard.tsx |
| S-08 手続き・期限 | nautra/src/app/(shore)/shore/procedures/page.tsx |
| S-09 訓練管理 | nautra/src/app/(shore)/shore/training/page.tsx |
| 船内シェル・V-01 打刻 | nautra/src/app/(vessel)/vessel/layout.tsx, vessel/page.tsx, vessel/punch/page.tsx |
| 船内サインイン・PIN入力 | nautra/src/app/(vessel)/vessel/login/page.tsx, vessel/_components/crew-picker.tsx |
| V-03 本日の労働・休息 | nautra/src/ui/limit-gauge.tsx, vessel/ledger/page.tsx |
| V-05 航海日誌・点検 | nautra/src/app/(vessel)/vessel/logbook/page.tsx, vessel/_components/checklist-section.tsx |
| V-09 同期状態 | nautra/src/app/(vessel)/vessel/sync/page.tsx |
| 配色・材質・状態表示 | docs/DESIGN.md, nautra/tailwind.config.ts, nautra/src/app/globals.css, nautra/src/ui/status-chip.tsx |
