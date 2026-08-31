/**
 * 画面遷移中の即時フィードバック（Suspense のフォールバック）。
 *
 * 遷移先の準備が終わるまで前の画面が固まったように見えるのを防ぐ。
 * 骨組みだけを同じ材質（ガラス面）で示し、内容が出た瞬間の見た目の飛びを小さくする。
 * 本番ビルドでは遷移がほぼ即座に終わるため、この表示はほとんど出ない。
 */
export default function VesselLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-label="読み込み中">
      <div className="h-8 w-56 rounded-medium bg-content2" />
      <div className="glass-tile h-28" />
      <div className="glass-tile h-40" />
      <div className="glass-tile h-40" />
    </div>
  );
}
