/**
 * モーダルの共通スタイル。
 * 画面側は `<Modal {...MODAL_CLASSNAMES}>` の形で参照し、独自スタイルを持たない
 * （基本設計書 6.3）。
 *
 * デザイン正本 `design/poc_design` のモーダルは、紙面のカードより一段だけ丸め（6px）、
 * 縁ではなく**落ちる影**（`0 24px 60px rgba(10,10,10,0.35)`）で浮かせる。背面は
 * `rgba(10,10,10,0.45)` の暗幕で落とすだけにし、ぼかしは使わない。材質は `.ui-modal`。
 */
export const MODAL_CLASSNAMES = {
  backdrop: "opaque" as const,
  classNames: {
    base: "ui-modal",
    header: "flex-col items-start gap-2 border-b border-[var(--ui-hairline)] px-6 pb-4 pt-5",
    body: "px-6 py-[18px]",
    footer: "gap-3 border-t border-[var(--ui-hairline)] px-6 pb-5 pt-4",
  },
};
