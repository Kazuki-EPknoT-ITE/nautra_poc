"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { WORK_CATEGORIES, type PunchAction, type WorkCategory } from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";
import { cn } from "@/lib/cn";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/format";
import { proposeCorrectionAction } from "../actions";

export interface AdjustRecordView {
  id: string;
  occurredAt: string;
  workCategory: WorkCategory;
  action: PunchAction;
  /** この打刻に、本人の確認待ちの修正案が出ているか */
  pending: boolean;
}

interface Row {
  id: string;
  at: string;
  workCategory: WorkCategory;
  action: PunchAction;
  original: { at: string; workCategory: WorkCategory };
  pending: boolean;
}

interface Addition {
  key: number;
  at: string;
  workCategory: WorkCategory;
  action: PunchAction;
}

/** よくある理由（押して入れ、足りなければ書き足す） */
const QUICK_REASONS = [
  "終了の押し忘れ",
  "時刻の押し間違い",
  "作業の種類の押し間違い",
  "航海日誌・当直表と食い違い",
];

/**
 * 修正案のフォーム（レビュー LABOR-06）。
 *
 * 時刻と作業を直した行、足した行が「修正案」として差戻しに添えられ、船内の本人へ届く。
 * ここでは**打刻を書き換えない**。本人が船内で「この内容で直す」を押したときに本人名義で入る
 * （要件定義書 3.2.1「修正は本人への差戻しのみ」）。理由は必須で、本人にも同じ文が出る。
 */
export function AdjustForm({
  crewMemberId,
  date,
  records,
}: {
  crewMemberId: string;
  date: string;
  records: AdjustRecordView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<Row[]>(() =>
    records.map((r) => {
      const at = toLocalInputValue(new Date(r.occurredAt));
      return {
        id: r.id,
        at,
        workCategory: r.workCategory,
        action: r.action,
        original: { at, workCategory: r.workCategory },
        pending: r.pending,
      };
    }),
  );
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  // 送信ごとの使い捨ての札。二度押し・再送でも同じ案が二重に積まれない（サーバが ID をこれから決める）
  const [opToken] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  );

  const changed = rows.filter((r) => r.at !== r.original.at || r.workCategory !== r.original.workCategory);
  const count = changed.length + additions.length;

  function update(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function submit() {
    setResult(null);
    const toIso = (v: string) => {
      const d = fromLocalInputValue(v);
      if (!d) throw new Error("日時を入力してください");
      return d.toISOString();
    };
    let input;
    try {
      input = {
        crewMemberId,
        date,
        reason,
        opToken,
        changes: changed.map((r) => ({ targetId: r.id, occurredAt: toIso(r.at), workCategory: r.workCategory })),
        additions: additions.map((a) => ({ workCategory: a.workCategory, action: a.action, occurredAt: toIso(a.at) })),
      };
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
      return;
    }
    startTransition(async () => {
      const res = await proposeCorrectionAction(input);
      setResult(res);
      if (res.ok) {
        // 送った案を画面に反映する（ページ側がこのフォームを組み直す。次の送信は新しい札になる）
        router.replace(`/shore/labor/adjust?crew=${encodeURIComponent(crewMemberId)}&date=${date}&saved=${input.changes.length + input.additions.length}`);
        router.refresh();
      }
    });
  }

  return (
    <section aria-label="修正案" className="ui-card flex flex-col gap-4 px-[18px] py-4">
      <div className="overflow-x-auto">
        <table className="ui-table">
          <thead>
            <tr>
              <th>打刻</th>
              <th>日時</th>
              <th>作業</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dirty = r.at !== r.original.at || r.workCategory !== r.original.workCategory;
              return (
                <tr key={r.id} className={cn(dirty && "bg-warning-100")}>
                  <td className="whitespace-nowrap font-bold">
                    {r.action === "start" ? "開始" : "終了"}
                    {r.pending ? (
                      <span className="ml-2 rounded-small bg-warning-100 px-1.5 py-px text-xs font-semibold text-warning-700">
                        確認待ち
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <input
                      type="datetime-local"
                      aria-label={`${r.action === "start" ? "開始" : "終了"}の日時`}
                      value={r.at}
                      onChange={(e) => update(r.id, { at: e.target.value })}
                      className="ui-field !w-auto !py-1.5 font-mono tabular-nums"
                    />
                  </td>
                  <td>
                    <select
                      aria-label="作業"
                      value={r.workCategory}
                      onChange={(e) => update(r.id, { workCategory: e.target.value as WorkCategory })}
                      className="ui-field !w-auto !py-1.5"
                    >
                      {WORK_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {t.workCategory[c]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-right">
                    {dirty ? (
                      <button
                        type="button"
                        className="ui-btn-quiet"
                        onClick={() => update(r.id, { at: r.original.at, workCategory: r.original.workCategory })}
                      >
                        ↺ 元に戻す
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {additions.map((a) => (
              <tr key={`add-${a.key}`} className="bg-warning-100">
                <td>
                  <select
                    aria-label="追加する打刻"
                    value={a.action}
                    onChange={(e) =>
                      setAdditions((p) => p.map((x) => (x.key === a.key ? { ...x, action: e.target.value as PunchAction } : x)))
                    }
                    className="ui-field !w-auto !py-1.5 font-bold"
                  >
                    <option value="start">＋ 開始</option>
                    <option value="end">＋ 終了</option>
                  </select>
                </td>
                <td>
                  <input
                    type="datetime-local"
                    aria-label="追加する打刻の日時"
                    value={a.at}
                    onChange={(e) => setAdditions((p) => p.map((x) => (x.key === a.key ? { ...x, at: e.target.value } : x)))}
                    className="ui-field !w-auto !py-1.5 font-mono tabular-nums"
                  />
                </td>
                <td>
                  <select
                    aria-label="追加する打刻の作業"
                    value={a.workCategory}
                    onChange={(e) =>
                      setAdditions((p) =>
                        p.map((x) => (x.key === a.key ? { ...x, workCategory: e.target.value as WorkCategory } : x)),
                      )
                    }
                    className="ui-field !w-auto !py-1.5"
                  >
                    {WORK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t.workCategory[c]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    className="ui-btn-quiet"
                    onClick={() => setAdditions((p) => p.filter((x) => x.key !== a.key))}
                  >
                    ✕ 取り消す
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className="ui-btn-ghost h-10 self-start"
        onClick={() =>
          setAdditions((p) => [
            ...p,
            {
              key: Date.now(),
              at: `${date}T${rows.length > 0 ? rows[rows.length - 1]!.at.slice(11, 16) : "12:00"}`,
              workCategory: rows[rows.length - 1]?.workCategory ?? WORK_CATEGORIES[0]!,
              action: rows[rows.length - 1]?.action === "start" ? "end" : "start",
            },
          ])
        }
      >
        ＋ 足りない打刻を足す
      </button>

      <div className="flex flex-col gap-2 border-t border-[var(--ui-hairline)] pt-4">
        <label htmlFor="adjust-reason" className="text-sm font-bold text-foreground-700">
          理由（必須・本人にも表示されます）
        </label>
        <div className="flex flex-wrap gap-2">
          {QUICK_REASONS.map((q) => (
            <button key={q} type="button" className="ui-btn-quiet" onClick={() => setReason(q)}>
              {q}
            </button>
          ))}
        </div>
        <textarea
          id="adjust-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="ui-field"
        />
      </div>

      {result ? (
        <p role="status" className={cn("m-0 text-base", result.ok ? "text-foreground-800" : "text-danger")}>
          {result.ok ? "✓" : "✕"} {result.message}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <span className="font-mono text-sm text-foreground-500">{count}件</span>
        <button
          type="button"
          className="ui-btn-primary h-11 px-6"
          disabled={pending || count === 0 || !reason.trim()}
          onClick={submit}
        >
          {pending ? "送信中…" : "本人に修正案を送る"}
        </button>
      </div>
    </section>
  );
}
