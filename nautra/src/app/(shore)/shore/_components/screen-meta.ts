/**
 * 画面名と一言（デザイン正本 `design/poc_design` の `SCREEN_META`）。
 *
 * ヘッダの見出しは**画面ごとに書かない**。ここを引くことで、同じ画面が別の入口から
 * 開かれても呼び名が変わらない（デザインの「画面名 + 12px の補足」を全画面で守る）。
 *
 * 動的セグメント（`/shore/crew/c1`）は `:id` で表す。長いパターンから順に照合する。
 */
const SCREEN_META: [pattern: string, title: string, note: string][] = [
  ["/shore/crew/:id/credentials", "資格・証書", "登録と原本確認（鮮度の解消）"],
  ["/shore/crew/:id/edit", "船員の登録・編集", "情報の入力はこの画面から"],
  ["/shore/crew/new", "船員の登録", "情報の入力はこの画面から"],
  ["/shore/crew/:id", "船員カルテ", "1名の情報をまとめて表示"],
  ["/shore/crew", "船員", "一覧・検索"],
  ["/shore/fleet/:id", "船の管理ページ", "この船のすべてを1画面で"],
  ["/shore/fleet", "船", "船の登録と検査・保守"],
  ["/shore/labor", "労務・記録簿", "労働時間の確認と承認"],
  ["/shore/manning", "配乗計画", "船員をドラッグして船に配置"],
  ["/shore/shifts", "シフト作成", "当直表をつくって船へ送る"],
  ["/shore/tasks", "作業の割り当て", "誰が何をやるかを決める"],
  ["/shore/training", "訓練", "修了状況の管理"],
  ["/shore/evaluations", "評価", "人事考課（閲覧者限定）"],
  ["/shore/wellbeing", "健康・相談", "匿名の集計と相談への回答"],
  ["/shore/filings", "届出", "4ステップで書類を作成"],
  ["/shore/procedures", "手続き・期限", "やるべき手続きと期限"],
  ["/shore/documents", "帳票・出力", "作った書類の一覧"],
  ["/shore/exports", "Excelに書き出す", "CSV形式でダウンロード"],
  ["/shore/dispatch", "配船・位置", "船の位置と予定"],
  ["/shore/safety", "安全・事故", "SMS と事故・ヒヤリハット"],
  ["/shore/office", "傭船・経理", "契約・請求・経費・給与・補助金"],
  ["/shore/templates", "記録項目の配信", "船内の入力項目をつくって送る"],
  ["/shore/notices", "お知らせ・速報", "船内へ知らせる"],
  ["/shore/trash", "削除したもの", "30日以内なら元に戻せます"],
  ["/shore/settings", "設定", "ユーザー・権限・上限値・監査"],
  ["/shore/login", "サインイン", ""],
  ["/shore", "ダッシュボード", "今日の注意点をまとめて確認"],
];

function matches(pattern: string, path: string): boolean {
  const p = pattern.split("/");
  const a = path.split("/");
  if (p.length !== a.length) return false;
  return p.every((seg, i) => (seg === ":id" ? a[i]!.length > 0 : seg === a[i]));
}

export function screenMeta(pathname: string): { title: string; note: string } {
  const trimmed = pathname.replace(/\/$/, "") || "/shore";
  for (const [pattern, title, note] of SCREEN_META) {
    if (matches(pattern, trimmed)) return { title, note };
  }
  return { title: "陸上アプリ", note: "" };
}

/**
 * 「戻る」の行き先（デザインのヘッダ左の ← ボタン）。
 * 履歴ではなく**画面の親**へ戻す。別の入口から開いても同じ場所に帰れるようにするため。
 */
export function parentOf(pathname: string): { href: string; label: string } | null {
  const trimmed = pathname.replace(/\/$/, "");
  const m = trimmed.match(/^\/shore\/crew\/([^/]+)\/(edit|credentials)$/);
  if (m) return { href: `/shore/crew/${m[1]}`, label: "船員カルテ" };
  if (/^\/shore\/crew\/[^/]+$/.test(trimmed) && !trimmed.endsWith("/new"))
    return { href: "/shore/crew", label: "船員" };
  if (trimmed === "/shore/crew/new") return { href: "/shore/crew", label: "船員" };
  if (/^\/shore\/fleet\/[^/]+$/.test(trimmed)) return { href: "/shore/fleet", label: "船" };
  if (trimmed === "/shore" || trimmed === "/shore/login") return null;
  return { href: "/shore", label: "ダッシュボード" };
}
