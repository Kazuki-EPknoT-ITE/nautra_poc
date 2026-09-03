import Link from "next/link";
import { t } from "@/i18n/ja";
import { personName } from "@/lib/crew";
import { findingLevel, nextOrderStatus } from "@/lib/fleet-plain";
import { fmtDateLabel, fmtDateTime } from "@/lib/format";
import { buildFleetBoard } from "@/server/fleet-service";
import { listVessels } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";
import { EQUIPMENT_KINDS } from "@/sync-protocol/records";
import { StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../_components/guard";
import { FindingForm, type FindingOption } from "./_components/finding-form";
import { PartStockControls } from "./_components/part-stock-controls";
import { PrepTaskList } from "./_components/prep-task-list";

export const dynamic = "force-dynamic";

/** 機器の状態（色だけに頼らずアイコンと文言を併記する） */
const COND: Record<string, { cls: string; icon: string }> = {
  good: { cls: "text-success", icon: "✓" },
  attention: { cls: "text-warning-700", icon: "⚠" },
  defect: { cls: "text-danger", icon: "✕" },
};

const ORDER_LABEL: Record<string, string> = {
  requested: "発注を依頼する",
  ordered: "発注済にする",
  delivered: "入荷済にする",
};

/**
 * S-11 船舶・保守・検査。
 *
 * 船舶マスタ（諸元・船内環境）、検査証書の期限、定期保守計画と実績、部品・消耗品の在庫、
 * 入渠・検査の準備と指摘、そして船内から届いた点検・保守の一次記録を1画面に集約する
 * （要件定義書 3.4.1 / 3.4.2 / 3.5.3）。
 * 次回予定日・経過超過・在庫の不足はいずれも導出値で、保存していない（12.3）。
 */
export default async function ShoreFleetPage({
  searchParams,
}: {
  searchParams: Promise<{ vessel?: string }>;
}) {
  const guard = await requireShore("manage_fleet");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="船舶・保守" />;

  const vessels = listVessels();
  const sp = await searchParams;
  const vesselId = vessels.find((v) => v.id === sp.vessel)?.id ?? vessels[0]?.id ?? "";
  const board = buildFleetBoard(vesselId);
  const latest = new Map(board.latestByEquipment);
  const master = board.master;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">船舶・保守・検査</h1>
        <p className="text-sm text-foreground-500">
          期限の判定は証書ルール {board.credentialRuleVersion} で行っています
        </p>
      </div>

      {/* 船の切替（サーバ側で組み立てるためリンクで切り替える） */}
      <section aria-label="船の切替" className="glass-tile flex flex-wrap items-center gap-2 p-4">
        <span className="text-sm text-foreground-500">船</span>
        {vessels.map((v) => (
          <Link
            key={v.id}
            href={`/shore/fleet?vessel=${v.id}`}
            className={`rounded-medium px-3 py-1.5 text-sm ${
              v.id === vesselId ? "bg-primary text-primary-foreground" : "bg-default-100"
            }`}
          >
            {v.name}
          </Link>
        ))}
      </section>

      {/* ── 船舶マスタ ── */}
      <section aria-label="船舶の基本情報" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">船舶の基本情報</h2>
        {!master ? (
          <p className="text-sm text-foreground-500">この船の情報は登録されていません。</p>
        ) : (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Field label="船名" value={master.name} />
            <Field
              label="総トン数"
              value={master.grossTonnage ? `${master.grossTonnage.toLocaleString()} トン` : undefined}
              numeric
            />
            <Field label="IMO番号" value={master.imoNumber} />
            <Field label="MMSI（AIS の識別子）" value={master.mmsi} numeric />
            <Field label="航行区域" value={master.navigationArea} />
            <Field
              label="法定定員"
              value={master.requiredCrew ? `${master.requiredCrew} 名` : undefined}
              numeric
            />
            <Field label="建造日" value={master.builtOn ? fmtDateLabel(master.builtOn) : undefined} />
            <Field
              label="基準労働期間"
              value={master.referencePeriodDays ? `${master.referencePeriodDays} 日` : undefined}
              numeric
            />
          </dl>
        )}
      </section>

      {/* ── 3.5.3 船内環境（快適職場環境・求人の的確表示） ── */}
      <section aria-label="船内の環境" className="glass-tile p-4">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="font-bold">船内の環境（居室・通信）</h2>
          <StatusChip level={board.environment.level} size="sm" />
          <span className="text-sm text-foreground-600">{board.environment.message}</span>
        </div>
        {!master ? (
          <p className="text-sm text-foreground-500">環境の情報は登録されていません。</p>
        ) : (
          <>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Field
                label="船内 Wi-Fi"
                value={
                  master.wifiAvailable === undefined
                    ? undefined
                    : master.wifiAvailable
                      ? "あり"
                      : "なし"
                }
              />
              <Field label="Wi-Fi のメモ" value={master.wifiNote} />
              <Field label="居室" value={master.cabinType} />
              <Field label="設備" value={master.amenities} />
              <Field
                label="環境を確認した日"
                value={
                  master.environmentVerifiedOn ? fmtDateLabel(master.environmentVerifiedOn) : undefined
                }
              />
            </dl>
            {board.environment.level !== "ok" ? (
              <p className="mt-2 text-sm text-warning-700">
                ⚠ 求人票に使う前に、船内の設備・通信環境が今もこのとおりか確認してください
                （求人情報は最新の内容にしておく必要があります）。
              </p>
            ) : null}
          </>
        )}
      </section>

      {/* ── 3.4.2 検査証書の期限 ── */}
      <section aria-label="検査証書の期限" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">
          検査証書・免許の期限
          <span className="ml-2 tabular-nums text-sm font-normal text-foreground-500">
            {board.credentials.length}件
          </span>
        </h2>
        {board.credentials.length === 0 ? (
          <p className="text-sm text-foreground-500">この船の証書は登録されていません。</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {board.credentials.map((c) => (
              <li
                key={c.credential.id}
                className="flex flex-col gap-1 border-b border-[var(--glass-border)] pb-2 last:border-b-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip level={c.level} size="sm" label={t.expiryState[c.expiry]} />
                  {c.freshness !== "fresh" ? (
                    <span className="text-warning-700">⚠ {t.freshnessState[c.freshness]}</span>
                  ) : null}
                  <span className="font-semibold">{c.credential.name}</span>
                  <span className="text-foreground-500">
                    {t.credentialCategory[c.credential.category]}
                    {c.credential.number ? ` / ${c.credential.number}` : ""}
                    {c.credential.issuer ? ` / ${c.credential.issuer}` : ""}
                  </span>
                </div>
                <p className="text-foreground-600">{c.message}</p>
                <p className="text-xs tabular-nums text-foreground-500">
                  {c.credential.expiresOn ? `期限 ${fmtDateLabel(c.credential.expiresOn)}` : "期限なし"}
                  {c.startOn ? ` / 手続きを始める目安 ${fmtDateLabel(c.startOn)}` : ""}
                  {c.credential.lastVerifiedOn
                    ? ` / 最後に確認 ${fmtDateLabel(c.credential.lastVerifiedOn)}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 3.4.1 定期保守計画 ── */}
      <section aria-label="定期保守の計画" className="glass-tile overflow-x-auto">
        <div className="px-4 pt-4">
          <h2 className="font-bold">
            定期保守の計画
            <span className="ml-2 tabular-nums text-sm font-normal text-foreground-500">
              予定日を過ぎているもの {board.plans.filter((p) => p.level === "violation").length}件
            </span>
          </h2>
          <p className="text-sm text-foreground-500">
            次回の予定日は「前回の実施日 + 周期」で毎回計算しています（保存していません）。
          </p>
        </div>
        {board.plans.length === 0 ? (
          <p className="p-4 text-sm text-foreground-500">保守の計画は登録されていません。</p>
        ) : (
          <table className="mt-2 w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
                <th className="px-4 py-2 font-medium">状態</th>
                <th className="px-2 py-2 font-medium">機器</th>
                <th className="px-2 py-2 font-medium">作業</th>
                <th className="px-2 py-2 font-medium">周期</th>
                <th className="px-2 py-2 font-medium">前回</th>
                <th className="px-2 py-2 font-medium">次回の予定</th>
                <th className="px-2 py-2 font-medium">船内の実績</th>
              </tr>
            </thead>
            <tbody>
              {board.plans.map((p) => (
                <tr key={p.plan.id} className="border-b border-[var(--glass-border)] last:border-b-0">
                  <td className="px-4 py-2">
                    <StatusChip level={p.level} size="sm" />
                  </td>
                  <td className="px-2 py-2 font-semibold">{t.equipment[p.plan.equipment]}</td>
                  <td className="px-2 py-2">
                    {p.plan.task}
                    <span className="block text-xs text-foreground-500">{p.message}</span>
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {p.plan.intervalDays}日
                    {p.plan.intervalHours ? (
                      <span className="block text-xs text-foreground-500">
                        または {p.plan.intervalHours.toLocaleString()}時間
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {p.plan.lastDoneOn ? fmtDateLabel(p.plan.lastDoneOn) : "—"}
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {p.nextDueOn ? fmtDateLabel(p.nextDueOn) : "—"}
                  </td>
                  <td className="px-2 py-2 text-xs text-foreground-600">
                    {p.lastRecord ? (
                      <>
                        {fmtDateTime(p.lastRecord.occurredAt)} /{" "}
                        {t.maintenanceRecordType[p.lastRecord.recordType]} /{" "}
                        {personName(p.lastRecord.crewMemberId)}
                        <span className={`ml-1 ${COND[p.lastRecord.condition].cls}`}>
                          {COND[p.lastRecord.condition].icon}
                          {t.condition[p.lastRecord.condition]}
                        </span>
                      </>
                    ) : (
                      <span className="text-foreground-500">船内からの実績はまだありません</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── 3.4.1 部品・消耗品の在庫 ── */}
      <section aria-label="部品・消耗品の在庫" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">
          部品・消耗品の在庫
          <span className="ml-2 tabular-nums text-sm font-normal text-foreground-500">
            足りないもの {board.stocks.filter((s) => s.level !== "ok").length}件
          </span>
        </h2>
        {board.stocks.length === 0 ? (
          <p className="text-sm text-foreground-500">在庫は登録されていません。</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {board.stocks.map((s) => (
              <li
                key={s.stock.id}
                className="flex flex-col gap-2 border-b border-[var(--glass-border)] pb-3 last:border-b-0"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <StatusChip level={s.level} size="sm" />
                  <span className="font-semibold">{s.stock.partName}</span>
                  <span className="text-foreground-500">
                    {s.stock.partNo ? `品番 ${s.stock.partNo}` : ""}
                    {s.stock.equipment ? ` / ${t.equipment[s.stock.equipment]}` : ""}
                    {s.stock.supplier ? ` / ${s.stock.supplier}` : ""}
                  </span>
                  <span className="tabular-nums">
                    在庫 {s.stock.quantity}
                    {s.stock.unit ?? ""}
                  </span>
                  <span className="text-foreground-500">
                    手配: {t.orderStatus[s.stock.orderStatus ?? "none"]}
                    {s.stock.orderedOn ? `（${fmtDateLabel(s.stock.orderedOn)}）` : ""}
                  </span>
                </div>
                <p className={`text-sm ${s.level === "ok" ? "text-foreground-600" : "text-warning-700"}`}>
                  {s.level === "ok" ? "" : "⚠ "}
                  {s.message}
                </p>
                <PartStockControls
                  stockId={s.stock.id}
                  unit={s.stock.unit}
                  nextLabel={
                    nextOrderStatus(s.stock.orderStatus)
                      ? ORDER_LABEL[nextOrderStatus(s.stock.orderStatus) as string]
                      : null
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 3.4.2 入渠・検査対応 ── */}
      <section aria-label="入渠・検査" className="flex flex-col gap-4">
        <h2 className="font-bold">入渠・検査</h2>
        {board.docks.length === 0 ? (
          <p className="glass-tile p-4 text-sm text-foreground-500">入渠の予定はありません。</p>
        ) : (
          board.docks.map((d) => {
            const findings = d.dock.findings ?? [];
            const options: FindingOption[] = findings.map((f) => ({
              key: f.key,
              label: `${t.findingStatus[f.status]}: ${f.content.slice(0, 30)}`,
              content: f.content,
              dueOn: f.dueOn ?? "",
              status: f.status,
              action: f.action ?? "",
            }));
            return (
              <div key={d.dock.id} className="glass-tile flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip level={d.level} size="sm" label={t.dockStatus[d.dock.status]} />
                  <span className="font-bold">{d.dock.title}</span>
                  <span className="text-sm text-foreground-500">
                    {t.dockKind[d.dock.kind]}
                    {d.dock.shipyard ? ` / ${d.dock.shipyard}` : ""}
                  </span>
                  <span className="text-sm tabular-nums text-foreground-500">
                    {fmtDateLabel(d.dock.plannedFrom)}
                    {d.dock.plannedTo ? ` 〜 ${fmtDateLabel(d.dock.plannedTo)}` : ""}
                  </span>
                </div>
                <p className="text-sm text-foreground-600">{d.message}</p>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="glass-inset p-3">
                    <h3 className="mb-2 text-sm font-bold">
                      入渠前の準備
                      <span className="ml-2 tabular-nums font-normal text-foreground-500">
                        {d.prepDone}/{d.prepTotal}件 完了
                      </span>
                    </h3>
                    <PrepTaskList
                      dockId={d.dock.id}
                      tasks={(d.dock.prepTasks ?? []).map((p) => ({
                        key: p.key,
                        label: p.label,
                        done: p.done,
                      }))}
                    />
                  </div>

                  <div className="glass-inset p-3">
                    <h3 className="mb-2 text-sm font-bold">
                      検査の指摘事項
                      <span
                        className={`ml-2 tabular-nums font-normal ${
                          d.openFindings > 0 ? "text-danger" : "text-foreground-500"
                        }`}
                      >
                        {d.openFindings > 0 ? `未対応 ${d.openFindings}件` : "残りはありません"}
                      </span>
                    </h3>
                    {findings.length === 0 ? (
                      <p className="text-sm text-foreground-500">指摘はありません。</p>
                    ) : (
                      <ul className="flex flex-col gap-2 text-sm">
                        {findings.map((f) => {
                          const fl = findingLevel(f, board.today);
                          return (
                            <li
                              key={f.key}
                              className={`flex flex-col gap-1 border-b border-[var(--glass-border)] pb-2 last:border-b-0 ${
                                f.status !== "closed" ? "border-l-2 border-l-warning pl-2" : ""
                              }`}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusChip
                                  level={fl.level}
                                  size="sm"
                                  label={t.findingStatus[f.status]}
                                />
                                <span className="text-xs tabular-nums text-foreground-500">
                                  {f.dueOn ? `期限 ${fmtDateLabel(f.dueOn)}` : "期限なし"} / {fl.message}
                                </span>
                              </div>
                              <p>{f.content}</p>
                              {f.action ? (
                                <p className="text-xs text-foreground-500">対応: {f.action}</p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                <FindingForm dockId={d.dock.id} dockTitle={d.dock.title} options={options} />
              </div>
            );
          })
        )}
      </section>

      {/* ── 船内から届いた点検・保守の一次記録 ── */}
      <section aria-label="要対応の機器" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">
          要対応の機器
          <span className={`ml-2 tabular-nums ${board.openIssues.length > 0 ? "text-danger" : ""}`}>
            {board.openIssues.length}件
          </span>
        </h2>
        {board.openIssues.length === 0 ? (
          <p className="text-sm text-foreground-500">要注意・不良の機器はありません。</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {board.openIssues.map((r) => (
              <li key={r.id} className="border-b border-[var(--glass-border)] pb-2 last:border-b-0">
                <p>
                  <span className={`font-bold ${COND[r.condition].cls}`}>
                    {COND[r.condition].icon} {t.condition[r.condition]}
                  </span>
                  <span className="ml-2 font-semibold">{t.equipment[r.equipment]}</span>
                  <span className="ml-2 text-foreground-500">
                    {t.maintenanceRecordType[r.recordType]} / {fmtDateTime(r.occurredAt)} /{" "}
                    {personName(r.crewMemberId)}
                  </span>
                </p>
                {r.action ? <p className="text-foreground-500">{r.action}</p> : null}
                {r.nextDueDate ? (
                  <p className="text-xs text-foreground-500">次回予定: {fmtDateLabel(r.nextDueDate)}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="機器別の最新状態" className="glass-tile overflow-x-auto">
        <h2 className="px-4 pt-4 font-bold">機器別の最新状態</h2>
        <table className="mt-2 w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
              <th className="px-4 py-2 font-medium">機器</th>
              <th className="px-2 py-2 font-medium">状態</th>
              <th className="px-2 py-2 font-medium">最終記録</th>
              <th className="px-2 py-2 font-medium">種別</th>
              <th className="px-2 py-2 font-medium">運転時間</th>
              <th className="px-2 py-2 font-medium">記録者</th>
            </tr>
          </thead>
          <tbody>
            {EQUIPMENT_KINDS.map((eq) => {
              const r = latest.get(eq);
              return (
                <tr key={eq} className="border-b border-[var(--glass-border)] last:border-b-0">
                  <td className="px-4 py-2 font-semibold">{t.equipment[eq]}</td>
                  <td className={`px-2 py-2 font-semibold ${r ? COND[r.condition].cls : ""}`}>
                    {r ? `${COND[r.condition].icon} ${t.condition[r.condition]}` : "—"}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{r ? fmtDateTime(r.occurredAt) : "記録なし"}</td>
                  <td className="px-2 py-2">{r ? t.maintenanceRecordType[r.recordType] : "—"}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {r?.runningHours !== undefined ? `${r.runningHours.toLocaleString()} h` : "—"}
                  </td>
                  <td className="px-2 py-2">{r ? personName(r.crewMemberId) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section aria-label="点検表の実施状況" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">点検表の実施状況（直近10件）</h2>
        {board.recentChecklists.length === 0 ? (
          <p className="text-sm text-foreground-500">実施記録がありません。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {board.recentChecklists.map((c) => (
              <li key={c.id} className="flex flex-wrap gap-2">
                <span className="tabular-nums text-foreground-500">{fmtDateTime(c.occurredAt)}</span>
                <span className="font-semibold">{t.checklistTemplate[c.templateId] ?? c.templateId}</span>
                <span className={c.overall === "pass" ? "text-success" : "text-danger"}>
                  {c.overall === "pass" ? "✓ 合格" : "✕ 不合格"}
                </span>
                <span className="text-foreground-500">
                  実施 {personName(c.recordedBy)} / 全{c.items.length}項目 / 版 {c.templateVersion}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** 定義リストの1項目（未登録は「—」で揃える） */
function Field({ label, value, numeric }: { label: string; value?: string; numeric?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-foreground-500">{label}</dt>
      <dd className={numeric ? "tabular-nums" : ""}>{value ?? "—"}</dd>
    </div>
  );
}
