import { cn } from "@/lib/cn";

/**
 * 記録の入口に添える線の絵（レビュー PUNCH-01 / TASKREC-02: 文字を読まなくても何の記録か分かるように）。
 *
 * 色は持たせない（`currentColor`。デザインの有彩色はブロンズとレンガだけ）。絵文字は端末ごとに
 * 色付きで描かれるので使わない。絵だけに頼らず、必ず文字のラベルと一緒に置く（色覚・慣れの差）。
 */
export type LineIconName =
  | "watch"
  | "cargo"
  | "standby"
  | "maintenance"
  | "other"
  | "rest"
  | "fuel"
  | "handover"
  | "calendar";

const PATHS: Record<LineIconName, React.ReactNode> = {
  // 舵輪（航海当直）
  watch: (
    <>
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="1.6" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
    </>
  ),
  // 吊り荷（荷役）
  cargo: (
    <>
      <path d="M12 2v6" />
      <path d="M9 8h6" />
      <rect x="5" y="11" width="14" height="10" rx="0.5" />
      <path d="M5 16h14M12 11v10" />
    </>
  ),
  // 砂時計（スタンバイ・待機）
  standby: (
    <>
      <path d="M6 2h12M6 22h12" />
      <path d="M7 2c0 5 10 5 10 10S7 17 7 22" />
      <path d="M17 2c0 5-10 5-10 10s10 5 10 10" />
    </>
  ),
  // スパナ（保守整備）
  maintenance: <path d="M14.5 3.5a5 5 0 0 0-6.2 6.2L3 15v4h4l5.3-5.3a5 5 0 0 0 6.2-6.2l-3 3-3-1-1-3z" />,
  // 点の並び（その他作業）
  other: (
    <>
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </>
  ),
  // 月（休息）
  rest: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  // しずく（燃料）
  fuel: (
    <>
      <path d="M12 2.5S5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 12 2.5 12 2.5z" />
      <path d="M9 15a3 3 0 0 0 3 3" />
    </>
  ),
  // 受け渡しの矢印（職務引継）
  handover: (
    <>
      <path d="M4 8h14l-3-3M20 16H6l3 3" />
    </>
  ),
  // 暦（日付を選ぶ）
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M8 14h2M14 14h2M8 17.5h2" />
    </>
  ),
};

export function LineIcon({ name, size = 32, className }: { name: LineIconName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("flex-none", className)}
    >
      {PATHS[name]}
    </svg>
  );
}
