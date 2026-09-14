import { cn } from "@/lib/cn";

/**
 * 顔写真の枠（デザイン正本 `design/poc_design` の `image-slot`）。
 *
 * 共用端末では「名前を読む」より**顔で選ぶ**ほうが速い。だから配乗ボード・作業割当・
 * 船員一覧・カルテのどこでも、同じ縦長の枠で同じ大きさに置く。
 *
 * 写真が入っていないときは**頭文字と `PHOTO` の印**を出す。空欄にすると
 * 「壊れている」と読まれ、写真を入れる操作にもたどり着けないため。
 */
const SIZES = {
  /**
   * 船内サインインの選択肢（デザイン正本の `showSignIn`）。
   * ここだけ**角を立てて濃いヘアライン**にする。押して選ぶ対象なので、
   * 丸い枠だと「写真の表示」に見えてボタンだと分かりにくいため。
   */
  login: {
    w: 48,
    h: 58,
    radius: 0,
    initial: "text-[18px]",
    mark: "text-[8px]",
    border: "border-[var(--ui-hairline-strong)]",
    gap: "gap-0.5",
  },
  /** 作業タスクのカード */
  xs: { w: 44, h: 54, radius: 12, initial: "text-lg", mark: "text-[8px]" },
  /** 配乗ボード・シフトボードのカード */
  sm: { w: 60, h: 74, radius: 12, initial: "text-2xl", mark: "text-[8px]" },
  /** 船の管理ページの乗組員 */
  md: { w: 56, h: 70, radius: 12, initial: "text-2xl", mark: "text-[8px]" },
  /** 船員一覧 */
  lg: { w: 96, h: 120, radius: 12, initial: "text-4xl", mark: "text-2xs" },
  /** 船員カルテ */
  xl: { w: 124, h: 156, radius: 14, initial: "text-5xl", mark: "text-2xs" },
} as const;

export function CrewPhoto({
  name,
  initial,
  src,
  size = "sm",
  className,
}: {
  name: string;
  /** 写真が無いときに出す頭文字（未指定なら氏名の1文字目） */
  initial?: string;
  /** 顔写真（PoC は縮小した data URL） */
  src?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s: {
    w: number;
    h: number;
    radius: number;
    initial: string;
    mark: string;
    border?: string;
    gap?: string;
  } = SIZES[size];
  return (
    <span
      className={cn(
        "flex flex-none flex-col items-center justify-center overflow-hidden border bg-[#DFE1E0]",
        s.gap ?? "gap-0.5",
        s.border ?? "border-[var(--ui-hairline)]",
        className,
      )}
      style={{ width: s.w, height: s.h, borderRadius: s.radius }}
    >
      {src ? (
        // 縮小済みの data URL をそのまま貼る（外部への通信は発生しない）
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${name} の顔写真`} className="h-full w-full object-cover" />
      ) : (
        <>
          <span className={cn("font-bold leading-none text-foreground-700", s.initial)} aria-hidden="true">
            {initial ?? name.slice(0, 1)}
          </span>
          <span
            className={cn("font-mono leading-none tracking-[0.06em] text-foreground-400", s.mark)}
            aria-hidden="true"
          >
            PHOTO
          </span>
        </>
      )}
    </span>
  );
}
