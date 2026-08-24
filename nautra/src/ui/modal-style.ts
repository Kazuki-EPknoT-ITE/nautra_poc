/**
 * モーダルの共通スタイル（リキッドガラス）。
 * 画面側は `<Modal {...GLASS_MODAL_CLASSNAMES}>` の形で参照し、独自スタイルを持たない
 * （基本設計書 6.3）。背景は暗幕＋ぼかしで、下の作業画面が透けて文脈を保つ。
 */
export const GLASS_MODAL_CLASSNAMES = {
  backdrop: "blur" as const,
  classNames: {
    base: "glass-modal",
    header: "border-b border-[var(--glass-border)]",
    footer: "border-t border-[var(--glass-border)]",
  },
};
