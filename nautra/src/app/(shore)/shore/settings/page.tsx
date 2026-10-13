import Link from "next/link";
import { PERMISSIONS, VESSEL_ROLES, can } from "@/domain/authz/roles";
import {
  SHORE_PERMISSIONS,
  SHORE_ROLE_PERMISSIONS,
  SHORE_ROLES,
  canShore,
} from "@/domain/authz/shore-roles";
import { t } from "@/i18n/ja";
import { DEMO_TENANT_ID } from "@/lib/crew";
import { fmtDateTime, fmtMinutes } from "@/lib/format";
import {
  CONNECTIVITY_PROFILE_LIST,
  DEFAULT_CONNECTIVITY_PROFILE,
} from "@/rules/connectivity-profiles";
import { DEFAULT_CREDENTIAL_RULE_SET } from "@/rules/credential-rules";
import {
  DEFAULT_DEPLOYMENT_TIER,
  DEFAULT_PUNCH_AUTH_METHOD,
  DEPLOYMENT_TIERS,
  FEATURE_GROUPS,
  PUNCH_AUTH_METHODS,
  disabledFeatures,
} from "@/rules/deployment-options";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";
import { DEFAULT_SAFETY_RULE_SET } from "@/rules/safety-rules";
import {
  buildRuleValueRows,
  currentLaborRuleSet,
  formatRuleValue,
  listAgreements,
  RULE_VALUE_UNIT,
} from "@/server/labor-rules";
import { crewNameOf, listAuditLogs, listVessels } from "@/server/master-service";
import { listShoreStaff, requireShore, shoreStaffById } from "@/server/shore-session";
import { trashedEntityIds } from "@/server/trash-service";
import { getSyncStats } from "@/server/store";
import { ShoreGuardNotice } from "../_components/guard";
import { UserInvitePanel } from "./_components/user-invite";
import { AgreementForm, type OverrideField } from "./_components/agreement-form";

export const dynamic = "force-dynamic";

/** 画面内の節（目次の並びと各 section の id を1か所で持つ） */
/**
 * 設定の主題（タブ）。8つの主題を1枚に積むと目的の節まで延々とめくることになるため、
 * **1画面1主題**に分ける（デザイン正本 S-15）。労使協定と判定に使う値は
 * 「協定を変えると閾値が変わる」関係なので同じ枚に置く。
 */
const SECTIONS = [
  { id: "tenant", label: "事業者の設定" },
  { id: "connectivity", label: "回線の運用" },
  { id: "punch-auth", label: "打刻の本人確認" },
  { id: "tiers", label: "導入の構成" },
  { id: "users", label: "ユーザー" },
  { id: "permissions", label: "権限表" },
  { id: "agreements", label: "労使協定・判定に使う値" },
  { id: "audit", label: "監査ログ・同期" },
];

/** 監査ログの実施者名（陸上スタッフ・船員のどちらでも解決する） */
function actorName(id: string): string {
  return shoreStaffById(id)?.name ?? crewNameOf(id);
}

/**
 * S-15 設定・権限・監査（基本設計書 6.2「ユーザ/ロール、労使協定閾値の反映、
 * テナント設定、監査ログ閲覧」）。
 *
 * - **権限表は実装から生成**する（陸上 `shore-roles.ts` / 船内 `roles.ts`）。表示用の写しを持たない
 * - **労使協定の締結内容が判定閾値にどう効いているか**を既定値と並べて見せる（6.5）
 * - **監査ログ**（12.6）。要配慮個人情報の参照ログが残っていることもここで確認できる
 */
export default async function ShoreSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ audit?: string; tab?: string; view?: string; add?: string }>;
}) {
  const guard = await requireShore("manage_settings");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="設定・権限・監査" />;

  const sp = await searchParams;
  /** いま開いている主題。未指定なら先頭 */
  const tab = SECTIONS.some((x) => x.id === sp.tab) ? sp.tab! : SECTIONS[0]!.id;
  const sync = getSyncStats();
  const labor = currentLaborRuleSet();
  const safety = DEFAULT_SAFETY_RULE_SET;
  const credential = DEFAULT_CREDENTIAL_RULE_SET;
  const ruleRows = buildRuleValueRows();
  const agreements = listAgreements();
  const vessels = listVessels();
  /**
   * ユーザー一覧。無効化して S-18 へ送ったものは出さない（消えたはずの人が
   * 設定に残っていると、権限を持っているように読めてしまうため）。
   */
  const trashedUsers = trashedEntityIds("ユーザー");
  const shoreUsers = listShoreStaff().filter((u) => !trashedUsers.has(u.id));
  const today = new Date().toISOString().slice(0, 10);

  const auditFilter = sp.audit && sp.audit !== "all" ? sp.audit : null;
  const permView = sp.view === "vessel" ? "vessel" : "shore";
  const addAgreement = sp.add === "1";
  const auditMatched = listAuditLogs(500).filter((l) => !auditFilter || l.action === auditFilter);
  /**
   * 監査ログは追記され続ける（要配慮情報は**参照するたび**に1件増える。12.6）ため、
   * 画面には新しい順に一定件数だけ出す。全件を出すと設定画面がログで埋まり、
   * 上にある設定そのものが見えなくなる。絞り込みで目的の操作だけに寄せられる。
   */
  const AUDIT_VIEW_LIMIT = 25;
  const auditLogs = auditMatched.slice(0, AUDIT_VIEW_LIMIT);
  const auditHidden = auditMatched.length - auditLogs.length;
  const auditActions = Object.keys(t.auditAction);

  /** 協定フォームの入力欄（単位は分ではなく時間で入力させる） */
  const overrideFields: OverrideField[] = ruleRows.map((r) => ({
    key: r.key,
    label: t.laborRuleValue[r.key] ?? r.key,
    unit: RULE_VALUE_UNIT[r.key] === "minutes" ? "時間" : RULE_VALUE_UNIT[r.key] === "days" ? "日" : "回",
    current:
      RULE_VALUE_UNIT[r.key] === "minutes" ? Math.round((r.applied / 60) * 10) / 10 : r.applied,
  }));

  return (
    <div className="flex flex-col gap-[18px]">
      {/* 主題の切替。1枚に1主題だけ出す（サーバ側で組み立てるためリンクで切り替える） */}
      <nav aria-label="設定の主題" className="ui-card flex flex-wrap gap-2 p-3">
        {SECTIONS.map((x) => (
          <Link
            key={x.id}
            href={`/shore/settings?tab=${x.id}`}
            aria-current={x.id === tab ? "page" : undefined}
            className={`ui-btn-quiet ${x.id === tab ? "ui-btn-selected" : ""}`}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {tab === "tenant" ? (
        <>
      {/* ── テナント設定 ── */}
      <section id="tenant" aria-label="事業者の設定" className="ui-card scroll-mt-20 p-4">
        <h2 className="mb-2 font-bold">事業者の設定</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { k: t.tenant.name, v: t.tenant.demoName },
            { k: t.tenant.id, v: DEMO_TENANT_ID },
            { k: t.tenant.vessels, v: vessels.map((v) => v.name).join(" / ") || "—" },
            { k: t.tenant.ruleLabor, v: labor.version },
          ].map((row) => (
            <div key={row.k} className="ui-inset p-3">
              <p className="text-xs text-foreground-500">{row.k}</p>
              <p className="font-semibold">{row.v}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            { k: t.tenant.ruleLabor, v: `${labor.version}（${labor.effectiveFrom} 適用）`, s: labor.source },
            { k: t.tenant.ruleSafety, v: `${safety.version}（${safety.effectiveFrom} 適用）`, s: safety.source },
            {
              k: t.tenant.ruleCredential,
              v: `${credential.version}（${credential.effectiveFrom} 適用）`,
              s: credential.source,
            },
          ].map((row) => (
            <div key={row.k} className="ui-inset cursor-help p-3" title={row.s}>
              <p className="text-sm font-semibold">{row.k}</p>
              <p className="text-sm tabular-nums">{row.v}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm" title="判定結果には適用した版を記録するため、基準を変えても過去の判定の意味は変わりません">
          アルコール検知の基準値 <span className="font-mono font-semibold">{safety.values.alcoholLimitMgPerL} mg/L</span>
        </p>
      </section>
        </>
      ) : null}

      {tab === "connectivity" ? (
        <>
      {/* ── 10.1 接続4類型ごとの運用構成 ── */}
      <section id="connectivity" aria-label="回線の状況に合わせた運用" className="ui-card scroll-mt-20 p-4">
        <h2 className="mb-3 font-bold" title="どの型でも記録は先に端末へ確定するため、打刻・記録は必ずできます。変わるのは「いつ送るか」だけです（要件定義書 10.1）">
          回線の状況に合わせた運用
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {CONNECTIVITY_PROFILE_LIST.map((p) => (
            <div
              key={p.id}
              className={`ui-inset cursor-help p-3 ${p.id === DEFAULT_CONNECTIVITY_PROFILE ? "border border-primary" : ""}`}
              title={`${p.description}\n${p.operationNote}`}
            >
              <p className="font-semibold">
                {p.label}
                {p.id === DEFAULT_CONNECTIVITY_PROFILE ? (
                  <span className="ml-2 text-xs font-normal text-foreground-500">（いまの設定）</span>
                ) : null}
              </p>
              <p className="mt-2 text-xs tabular-nums text-foreground-500">
                同期の間隔:{" "}
                {p.syncIntervalMs === 0 ? "手動のみ" : `${Math.round(p.syncIntervalMs / 60000)}分ごと`}
                {" / "}即時通知: {p.useLiveStream ? "使う" : "使わない"}
                {" / "}1回に送る件数: {p.batchSize}
              </p>
            </div>
          ))}
        </div>
      </section>
        </>
      ) : null}

      {tab === "punch-auth" ? (
        <>
      {/* ── 3.2.1 打刻認証の方式 ── */}
      <section id="punch-auth" aria-label="打刻のときの本人確認" className="ui-card scroll-mt-20 p-4">
        <h2 className="mb-3 font-bold" title="どの方式でも、誰の記録かは必ず残ります（要件定義書 3.2.1）">
          打刻のときの本人確認
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PUNCH_AUTH_METHODS.map((m) => (
            <div
              key={m.id}
              className={`ui-inset cursor-help p-3 ${m.id === DEFAULT_PUNCH_AUTH_METHOD ? "border border-primary" : ""}`}
              title={`${m.suitedFor}\n${m.note}`}
            >
              <p className="font-semibold">
                {m.label}
                {m.id === DEFAULT_PUNCH_AUTH_METHOD ? (
                  <span className="ml-2 text-xs font-normal text-foreground-500">（いまの設定）</span>
                ) : null}
              </p>
              <p className="mt-2 text-xs text-foreground-500">
                {m.needsHardware ? "追加の機材が要ります" : "追加の機材は不要"}
                {" / "}
                {m.availableInPoc ? "この PoC で動きます" : "本番で追加"}
              </p>
            </div>
          ))}
        </div>
      </section>
        </>
      ) : null}

      {tab === "tiers" ? (
        <>
      {/* ── 10.5 段階的実装・縮退構成 ── */}
      <section id="tiers" aria-label="導入の構成" className="ui-card scroll-mt-20 p-4">
        <h2 className="mb-3 font-bold" title="慣れに応じて構成を上げられ、最小構成でも法令対応は成立します（要件定義書 10.5）">
          導入の構成
        </h2>
        <div className="grid gap-3 lg:grid-cols-3">
          {DEPLOYMENT_TIERS.map((tier) => {
            const off = disabledFeatures(tier.id);
            return (
              <div
                key={tier.id}
                className={`ui-inset cursor-help p-3 ${tier.id === DEFAULT_DEPLOYMENT_TIER ? "border border-primary" : ""}`}
                title={`${tier.description}\n${tier.note}`}
              >
                <p className="font-semibold">
                  {tier.label}
                  {tier.id === DEFAULT_DEPLOYMENT_TIER ? (
                    <span className="ml-2 text-xs font-normal text-foreground-500">（いまの構成）</span>
                  ) : null}
                </p>
                <p className="mt-2 text-xs tabular-nums text-foreground-500">
                  使う機能 {tier.features.length} / {FEATURE_GROUPS.length} 件
                </p>
                {off.length > 0 ? (
                  <p className="mt-1 text-xs text-foreground-500">
                    入れないもの: {off.map((f) => f.label).join("・")}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <caption className="sr-only">機能群と法令直結の区分</caption>
            <thead>
              <tr className="border-b border-[var(--ui-hairline)] text-left">
                <th className="py-2 pr-3 font-semibold">機能</th>
                <th className="py-2 pr-3 font-semibold">法令に直結</th>
                <th className="py-2 font-semibold">根拠</th>
              </tr>
            </thead>
            <tbody>
              {FEATURE_GROUPS.map((f) => (
                <tr key={f.id} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                  <td className="py-1.5 pr-3">{f.label}</td>
                  <td className="py-1.5 pr-3">
                    {f.required ? (
                      <span className="font-semibold">● 必須</span>
                    ) : (
                      <span className="text-foreground-500">○ 任意</span>
                    )}
                  </td>
                  <td className="py-1.5 text-xs text-foreground-500">{f.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
        </>
      ) : null}

      {tab === "users" ? (
        <>
      {/* ── ユーザ・ロール（陸上） ── */}
      <UserInvitePanel
        users={shoreUsers.map((a) => ({
          id: a.id,
          name: a.name,
          email: a.email,
          roleKey: a.role,
          role: t.shoreRole[a.role] ?? a.role,
          title: a.title,
          status: a.status,
          scope: a.scope,
          inviteCode: a.inviteCode,
          current: a.id === guard.staff.id,
          sensitive: canShore(a.role, "view_sensitive_health"),
        }))}
        roles={SHORE_ROLES.map((r) => ({ value: r, label: t.shoreRole[r] ?? r }))}
        vessels={vessels.map((v) => v.name)}
      />
        </>
      ) : null}
      {tab === "permissions" ? (
        <>

      <div className="flex flex-wrap gap-2" role="group" aria-label="権限表の切り替え">
        <Link href="/shore/settings?tab=permissions" aria-current={permView === "shore" ? "true" : undefined} className={`ui-btn-quiet ${permView === "shore" ? "ui-btn-selected" : ""}`}>
          陸上
        </Link>
        <Link href="/shore/settings?tab=permissions&view=vessel" aria-current={permView === "vessel" ? "true" : undefined} className={`ui-btn-quiet ${permView === "vessel" ? "ui-btn-selected" : ""}`}>
          船内アプリ
        </Link>
      </div>
      {permView === "shore" ? (
      <section id="permissions" aria-label="陸上ロールの権限表" className="ui-card scroll-mt-20 overflow-x-auto">
        <h2 className="px-4 pb-2 pt-4 font-bold" title="要配慮個人情報（既往歴・服薬状況）を見られるのは労務管理責任者と管理者だけで、参照そのものも監査ログに残ります（10.3 / 12.6）">
          できること（陸上）
        </h2>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
              <th className="px-4 py-2 font-medium">できること</th>
              {SHORE_ROLES.map((role) => (
                <th key={role} className="px-3 py-2 text-center font-medium">
                  {t.shoreRole[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SHORE_PERMISSIONS.map((p) => (
              <tr key={p} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                <td className="px-4 py-2">
                  {t.shorePermission[p] ?? p}
                </td>
                {SHORE_ROLES.map((role) => (
                  <td key={role} className="px-3 py-2 text-center">
                    {canShore(role, p) ? (
                      <span className="font-bold text-success">○</span>
                    ) : (
                      <span className="text-foreground-400">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      ) : (
      <section aria-label="船内ロールの権限表" className="ui-card overflow-x-auto">
        <h2 className="px-4 pb-2 pt-4 font-bold" title="陸上の労務管理責任者は、船長の承認より優先する承認権を持ちます（役割優先。基本設計書 8.3）">
          できること（船内アプリ）
        </h2>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
              <th className="px-4 py-2 font-medium">できること</th>
              {VESSEL_ROLES.map((role) => (
                <th key={role} className="px-3 py-2 text-center font-medium">
                  {t.role[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                <td className="px-4 py-2">
                  {t.permission[p] ?? p}
                </td>
                {VESSEL_ROLES.map((role) => (
                  <td key={role} className="px-3 py-2 text-center">
                    {can(role, p) ? (
                      <span className="font-bold text-success">○</span>
                    ) : (
                      <span className="text-foreground-400">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      )}
        </>
      ) : null}

      {tab === "agreements" ? (
        <>
      {/* ── 労使協定 → 判定閾値（6.5） ── */}
      <section id="agreements" aria-label="協定・就業規則" className="ui-card scroll-mt-20 p-4">
        <h2 className="mb-2 font-bold">労使協定・就業規則</h2>
        {agreements.length === 0 ? (
          <p className="text-sm text-foreground-500">登録されている協定・規則はありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
                  <th className="px-2 py-2 font-medium">種類</th>
                  <th className="px-2 py-2 font-medium">標題</th>
                  <th className="px-2 py-2 font-medium">版</th>
                  <th className="px-2 py-2 font-medium">届出日</th>
                  <th className="px-2 py-2 font-medium">適用期間</th>
                  <th className="px-2 py-2 font-medium">判定への反映</th>
                </tr>
              </thead>
              <tbody>
                {agreements.map((a) => {
                  const active =
                    a.effectiveFrom <= today && (!a.effectiveTo || a.effectiveTo >= today);
                  const overrideCount = Object.keys(a.overrideValues ?? {}).length;
                  return (
                    <tr key={a.id} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                      <td className="px-2 py-2">{t.agreementKind[a.kind] ?? a.kind}</td>
                      <td className="px-2 py-2">
                        <p className="font-semibold">{a.title}</p>
                        {a.body ? (
                          <p className="text-xs text-foreground-600">{a.body}</p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 tabular-nums">{a.version}</td>
                      <td className="px-2 py-2 tabular-nums">{a.filedOn ?? "—"}</td>
                      <td className="px-2 py-2 tabular-nums">
                        {a.effectiveFrom} 〜 {a.effectiveTo ?? "（無期限）"}
                      </td>
                      <td className="px-2 py-2">
                        {active ? (
                          overrideCount > 0 ? (
                            <span className="font-semibold text-success">
                              ✓ 適用中（{overrideCount}項目を上書き）
                            </span>
                          ) : (
                            <span>適用中（上書きなし）</span>
                          )
                        ) : (
                          <span className="text-foreground-500">適用期間外</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="thresholds" aria-label="判定に使う値" className="ui-card scroll-mt-20 overflow-x-auto">
        <h2
          className="px-4 pb-2 pt-4 font-bold"
          title={`判定結果には適用した版（${labor.version}）が記録されます。既定値の出典: ${DEFAULT_LABOR_RULE_SET.source}`}
        >
          いま判定に使っている値
        </h2>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
              <th className="px-4 py-2 font-medium">項目</th>
              <th className="px-2 py-2 text-right font-medium">法令の既定値</th>
              <th className="px-2 py-2 text-right font-medium">いまの値</th>
              <th className="px-2 py-2 font-medium">上書き元</th>
            </tr>
          </thead>
          <tbody>
            {ruleRows.map((r) => (
              <tr key={r.key} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                <td className="px-4 py-2">{t.laborRuleValue[r.key] ?? r.key}</td>
                <td className="px-2 py-2 text-right tabular-nums text-foreground-600">
                  {formatRuleValue(r.key, r.base)}
                </td>
                <td
                  className={`px-2 py-2 text-right tabular-nums font-semibold ${r.changed ? "text-warning-700" : ""}`}
                >
                  {r.changed ? "✎ " : ""}
                  {formatRuleValue(r.key, r.applied)}
                </td>
                <td className="px-2 py-2 text-xs text-foreground-600">
                  {r.overridden ? (
                    <>
                      {r.sourceTitle}（版{r.sourceVersion}）
                      {r.changed ? "" : " — 既定値と同じ値で締結"}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {addAgreement ? (
      <AgreementForm
        fields={overrideFields}
        options={agreements.map((a) => ({
          id: a.id,
          label: `${t.agreementKind[a.kind] ?? a.kind} / ${a.title}（版${a.version}）`,
        }))}
        today={today}
      />
      ) : (
        <p className="m-0">
          <Link href="/shore/settings?tab=agreements&add=1" className="ui-btn-primary inline-flex">
            ＋ 協定・規則を登録する
          </Link>
        </p>
      )}
        </>
      ) : null}

      {tab === "audit" ? (
        <>
      {/* ── 監査ログ（12.6） ── */}
      <section id="audit" aria-label="監査ログ" className="ui-card scroll-mt-20 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="font-bold" title="マスタの更新・要配慮情報の参照・出力を残します。追記のみで、あとから書き換えられません（要件定義書 10.4 / 12.6）">
            監査ログ
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-2">
          <span className="text-sm text-foreground-500">絞り込み</span>
          <Link
            href="/shore/settings?tab=audit"
            className={`rounded-medium px-3 py-1.5 text-sm ${
              !auditFilter ? "bg-primary text-primary-foreground" : "bg-default-100"
            }`}
          >
            すべて
          </Link>
          {auditActions.map((a) => (
            <Link
              key={a}
              href={`/shore/settings?tab=audit&audit=${a}`}
              className={`rounded-medium px-3 py-1.5 text-sm ${
                auditFilter === a ? "bg-primary text-primary-foreground" : "bg-default-100"
              }`}
            >
              {t.auditAction[a]}
            </Link>
          ))}
        </div>
        <div className="ui-table-scroll" style={{ maxHeight: 560 }}>
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
              <th className="px-4 py-2 font-medium">日時</th>
              <th className="px-2 py-2 font-medium">操作</th>
              <th className="px-2 py-2 font-medium">対象</th>
              <th className="px-2 py-2 font-medium">経路</th>
              <th className="px-2 py-2 font-medium">実施者</th>
              <th className="px-2 py-2 font-medium">概要</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log) => (
              <tr key={log.id} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                <td className="px-4 py-2 tabular-nums">{fmtDateTime(log.occurredAt)}</td>
                <td className="px-2 py-2">
                  <span
                    className={log.action === "view_sensitive" ? "font-semibold text-warning-700" : ""}
                  >
                    {log.action === "view_sensitive" ? "⚠ " : ""}
                    {t.auditAction[log.action] ?? log.action}
                  </span>
                </td>
                <td className="px-2 py-2">
                  {t.syncKindExtra[log.entityKind] ?? t.syncKind[log.entityKind] ?? log.entityKind}
                  {log.entityId ? (
                    <span className="ml-1 text-xs text-foreground-500">{log.entityId}</span>
                  ) : null}
                </td>
                <td className="px-2 py-2">{t.auditChannel[log.channel] ?? log.channel}</td>
                <td className="px-2 py-2">{actorName(log.actor)}</td>
                <td className="px-2 py-2 text-foreground-600">
                  {log.summary ?? ""}
                  {log.before || log.after ? (
                    <span className="block text-xs text-foreground-500">
                      {log.before ? `${log.before} → ` : ""}
                      {log.after ?? ""}
                    </span>
                  ) : null}
                  {log.externalSource ? (
                    <span className="block text-xs text-foreground-500">
                      外部連携: {log.externalSource}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
            {auditLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-3 text-sm text-foreground-500">
                  この条件の監査ログはありません。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
        <p className="px-4 py-3 text-xs text-foreground-500">
          新しい {auditLogs.length}件{auditHidden > 0 ? ` ／ ほか ${auditHidden}件（絞り込みで探せます）` : ""}
        </p>
      </section>

      <section aria-label="同期" className="ui-card p-4">
        <h2 className="mb-2 font-bold">同期</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            サーバ版 <span className="tabular-nums font-bold">v{sync.serverVersion}</span>
          </span>
          <span>
            受信イベント <span className="tabular-nums font-bold">{sync.eventCount}</span> 件
          </span>
          <span>
            隔離 <span className="tabular-nums font-bold">{sync.quarantineCount}</span> 件
          </span>
          <span className={sync.conflictCount > 0 ? "text-danger" : undefined}>
            競合（要確認） <span className="tabular-nums font-bold">{sync.conflictCount}</span> 件
          </span>
        </div>
      </section>
        </>
      ) : null}
    </div>
  );
}
