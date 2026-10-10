/**
 * 画面名（デザイン正本 `design/poc_design` の `SCREEN_META`）。
 *
 * 画面名の横に添えていた「一言」は**出さない**（レビュー 0-1 / DASH-01 ほか）。
 * 説明文に頼らず、画面の作りで伝える。
 *
 * ヘッダの見出しは**画面ごとに書かない**。ここを引くことで、同じ画面が別の入口から
 * 開かれても呼び名が変わらない（デザインの「画面名 + 12px の補足」を全画面で守る）。
 *
 * 動的セグメント（`/shore/crew/c1`）は `:id` で表す。長いパターンから順に照合する。
 */
const SCREEN_META: [pattern: string, title: string][] = [
  ["/shore/crew/:id/credentials", "資格・証書"],
  ["/shore/crew/:id/edit", "船員の登録・編集"],
  ["/shore/crew/new", "船員の登録"],
  ["/shore/crew/:id", "船員カルテ"],
  ["/shore/crew", "船員"],
  ["/shore/fleet/:id", "船の管理ページ"],
  ["/shore/fleet", "船"],
  ["/shore/labor", "労務・記録簿"],
  ["/shore/manning", "配乗計画"],
  ["/shore/shifts", "シフト作成"],
  ["/shore/tasks", "作業の割り当て"],
  ["/shore/training", "訓練"],
  ["/shore/evaluations", "評価"],
  ["/shore/wellbeing", "健康・相談"],
  ["/shore/filings", "届出"],
  ["/shore/procedures", "手続き・期限"],
  ["/shore/documents", "帳票・出力"],
  ["/shore/exports", "Excelに書き出す"],
  ["/shore/dispatch", "配船・位置"],
  ["/shore/safety", "安全・事故"],
  ["/shore/office", "傭船・経理"],
  ["/shore/templates", "記録項目の配信"],
  ["/shore/notices", "お知らせ・速報"],
  ["/shore/trash", "削除したもの"],
  ["/shore/settings", "設定"],
  ["/shore/login", "サインイン"],
  ["/shore", "ダッシュボード"],
];

function matches(pattern: string, path: string): boolean {
  const p = pattern.split("/");
  const a = path.split("/");
  if (p.length !== a.length) return false;
  return p.every((seg, i) => (seg === ":id" ? a[i]!.length > 0 : seg === a[i]));
}

export function screenMeta(pathname: string): { title: string } {
  const trimmed = pathname.replace(/\/$/, "") || "/shore";
  for (const [pattern, title] of SCREEN_META) {
    if (matches(pattern, trimmed)) return { title };
  }
  return { title: "陸上アプリ" };
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
