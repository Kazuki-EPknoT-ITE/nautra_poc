import Link from "next/link";
import { t } from "@/i18n/ja";
import type { ShoreGuard } from "@/server/shore-session";

/**
 * 権限のない画面・未サインインの表示（要件定義書 10.3）。
 *
 * 権限外の画面では**何も中身を出さない**。他船員の氏名・労務の数値・要配慮情報が
 * 断片的にでも漏れないよう、理由と次の操作だけを示す（船内 02 の方針と揃える）。
 */
export function ShoreGuardNotice({ guard, screen }: { guard: ShoreGuard; screen: string }) {
  if (guard.ok) return null;

  if (guard.reason === "signed_out") {
    return (
      <div className="glass-tile flex flex-col items-start gap-3 p-6">
        <h1 className="text-xl font-bold">サインインしてください</h1>
        <p className="text-sm text-foreground-600">
          {screen} を開くにはサインインが必要です。担当者を選ぶと、その役職で使える機能だけが
          表示されます。
        </p>
        <Link
          href="/shore/login"
          className="rounded-medium bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          サインインへ
        </Link>
      </div>
    );
  }

  return (
    <div className="glass-tile flex flex-col items-start gap-3 p-6">
      <h1 className="text-xl font-bold">この画面を開く権限がありません</h1>
      <p className="text-sm text-foreground-600">
        {screen} は、いまサインインしている
        <span className="font-semibold">
          {guard.staff ? `${guard.staff.name}（${t.shoreRole[guard.staff.role]}）` : "担当者"}
        </span>
        の役職では扱えません。担当者を切り替えるか、管理者に権限の付与を依頼してください。
      </p>
      <div className="flex gap-2">
        <Link
          href="/shore"
          className="rounded-medium bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          ダッシュボードへ
        </Link>
        <Link
          href="/shore/login"
          className="rounded-medium border border-[var(--glass-border)] px-4 py-2 text-sm"
        >
          担当者を切り替える
        </Link>
      </div>
    </div>
  );
}
