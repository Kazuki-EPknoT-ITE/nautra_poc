/**
 * モーダルの共通スタイル。
 * 画面側は `<Modal {...MODAL_CLASSNAMES}>` の形で参照し、独自スタイルを持たない
 * （基本設計書 6.3）。
 *
 * DESIGN.md にはモーダルの定義が無いため、**カードと同じ材質**（白の紙面・24px の角丸・
 * ヘアライン・浅い影）を流用する。背面は暗幕で落とすだけにし、ぼかしは使わない
 * （DESIGN.md はすべての面を単色で塗る）。
 */
export const MODAL_CLASSNAMES = {
  backdrop: "opaque" as const,
  classNames: {
    base: "ui-modal",
    header: "border-b border-[var(--ui-hairline)]",
    footer: "border-t border-[var(--ui-hairline)]",
  },
};
