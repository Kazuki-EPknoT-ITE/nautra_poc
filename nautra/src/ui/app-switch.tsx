import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * 船内アプリ ⇄ 陸上アプリ の行き来（デザイン正本 `design/poc_design` の `goShore` / `goVessel`）。
 *
 * **両方の入口から、いつでも反対側へ行ける**ようにする。片方にしか導線が無いと、
 * 入口（`/`）まで戻るか URL を打ち直すことになり、デモの最中に流れが切れる。
 *
 * 実運用では船内端末と陸上 PC は別の機械なので、この行き来は本番では使わない。
 * だから**画面名の隣ではなくヘッダの端**に置き、業務の操作と混ざらないようにしてある。
 *
 * ここは `src/ui/` なので、船内・陸上のどちらからも使える（ガードレール⑦
 * 「(vessel) ⇔ (shore) の相互 import 禁止」に触れない共有の置き場）。
 */
export function AppSwitchLink({
  to,
  tone = "light",
  className,
}: {
  /** 行き先のアプリ */
  to: "vessel" | "shore";
  /** 置く面の明るさ。暗いサイドバーの上では枠と文字を反転させる */
  tone?: "light" | "dark";
  className?: string;
}) {
  const href = to === "vessel" ? "/vessel" : "/shore";
  const label = to === "vessel" ? "船内アプリへ" : "陸上アプリへ";
  return (
    <Link
      href={href}
      title={`${label}（船内と陸上は別のアプリです）`}
      className={cn(
        tone === "dark"
          ? "flex w-full items-center justify-between rounded-small border border-[#666666] px-3 py-2.5 text-base text-[#DFE1E0]"
          : "ui-btn-ghost h-[34px] flex-none px-3 text-xs",
        className,
      )}
    >
      <span>{label}</span>
      <span aria-hidden="true" className="text-primary">
        →
      </span>
    </Link>
  );
}
