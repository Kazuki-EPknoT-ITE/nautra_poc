import { fmtHoursShort } from "@/lib/format";
import { evaluateCredentials } from "@/domain/crew/freshness";
import { startDeadlineOf } from "@/domain/procedures/deadlines";
import { DEFAULT_CREDENTIAL_RULE_SET } from "@/rules/credential-rules";
import { buildShoreDashboard } from "@/server/labor-service";
import { buildManningBoard } from "@/server/manning-service";
import {
  credentialsOf,
  effective,
  listCrewMasters,
  listVessels,
  todayLocal,
  vesselNameOf,
} from "@/server/master-service";
import { listTasks, TASK_STATE_LABEL } from "@/server/task-service";
import { buildStandbySummary } from "@/server/document-service";
import { currentShiftPlans } from "@/server/trash-service";

/**
 * 書き出し（各画面の「◯◯を書き出す」。レビュー EXPORT-01〜03）。
 *
 * 「Excel に落として社内で回す」という実務は消えない。だから**画面で見えている値を
 * そのまま**書き出せるようにする。列の意味が画面とずれないよう、行の組み立ては
 * ここ1か所に置き、画面・API の双方がこれを使う。
 *
 * 書き出し専用の画面（旧 S-17）は廃止し、各画面の書き出しボタンが対象を決める。
 * 形式は Excel ブック（.xlsx・既定）と区切りテキスト（.csv / .txt）。区切りテキストだけ
 * 文字コード（UTF-8 BOM 付き / Shift_JIS / UTF-8）を選べる。
 */

export type ExportSetId = "crew" | "manning" | "labor" | "shift" | "task" | "vessel" | "filing" | "standby";

/** 書き出しの形式。画面では拡張子と用途で見せ、"CSV" という言葉は使わない（EXPORT-02） */
export type ExportFormat = "xlsx" | "csv" | "tsv";

export function exportFormatOf(v: string | null): ExportFormat {
  return v === "csv" || v === "tsv" ? v : "xlsx";
}

export const EXPORT_EXTENSION: Record<ExportFormat, string> = { xlsx: "xlsx", csv: "csv", tsv: "txt" };

export interface ExportSet {
  id: ExportSetId;
  label: string;
  note: string;
  /** どの画面の値か（同じ数字が別画面と食い違わないことを示す） */
  from: string;
  columns: string[];
}

export const EXPORT_SETS: ExportSet[] = [
  {
    id: "crew",
    label: "船員名簿",
    note: "船員マスタ（基本情報・資格・配乗状況）",
    from: "S-02 船員一覧 ／ S-04 船員マスタ編集",
    columns: ["船員ID", "氏名", "フリガナ", "職位", "生年月日", "乗船中の船", "海技免状", "免状期限", "基本訓練", "配乗可否"],
  },
  {
    id: "manning",
    label: "配乗計画",
    note: "船×船員の配乗と乗下船イベント",
    from: "S-05 配乗計画ボード ／ S-11D 船舶ごとの管理",
    columns: ["船名", "船員ID", "氏名", "職位", "乗船予定日", "下船予定日", "状態"],
  },
  {
    id: "labor",
    label: "打刻・労務記録",
    note: "日次の労働／休息と承認状態（記録簿の元データ）",
    from: "S-06 労務管理 ／ V-01 打刻",
    columns: ["日付", "船名", "船員ID", "氏名", "労働時間", "休息時間", "判定", "承認状態"],
  },
  {
    id: "shift",
    label: "当直シフト",
    note: "シフト作成で組んだ当直割当（配信済み・作成中とも）",
    from: "S-10 シフト作成",
    columns: ["船名", "日付", "時間帯", "船員ID", "氏名", "種別", "配信状態"],
  },
  {
    id: "task",
    label: "作業・タスク",
    note: "船員ごとの作業割当と進捗",
    from: "S-16 作業指示・タスク割当",
    columns: ["タスクID", "作業内容", "船名", "船員ID", "氏名", "期限", "周期", "状態"],
  },
  {
    id: "vessel",
    label: "船舶・証書期限",
    note: "船舶マスタと検査証書",
    from: "S-11 船舶・保守・検査 ／ S-11D 船舶ごとの管理",
    columns: ["船名", "総トン数", "船種", "IMO番号", "定員", "証書名", "有効期限", "状態"],
  },
  {
    id: "filing",
    label: "手続き・提出記録",
    note: "届出インベントリと帳票の提出履歴",
    from: "S-08 手続き・期限管理 ／ S-14 帳票・出力センター",
    columns: ["手続き名", "根拠法令", "対象", "提出期限", "着手期限", "状態", "提出日"],
  },
  {
    id: "standby",
    label: "待機・荷役の実績",
    note: "月別・港別の待機時間と荷役時間（荷主・オペレーターとの協議資料。3.6.4）",
    from: "S-14 帳票・出力センター ／ V-07 作業記録",
    columns: ["月", "港", "待機の回数", "待機時間(分)", "待機時間(時間)", "荷役の回数", "荷役時間(分)", "荷役時間(時間)", "終了未記録の件数"],
  },
];

export function exportSetById(id: string): ExportSet | undefined {
  return EXPORT_SETS.find((s) => s.id === id);
}

const LEVEL_LABEL: Record<string, string> = { ok: "適合", caution: "注意", violation: "警告" };
const PROCEDURE_STATUS_LABEL: Record<string, string> = {
  open: "未着手",
  in_progress: "着手中",
  done: "提出済み",
  canceled: "取り消し",
};

/** 書き出す行（ヘッダは含まない）。列は ExportSet.columns と同じ順 */
export function buildExportRows(id: ExportSetId, now = new Date()): string[][] {
  const today = todayLocal(now);

  if (id === "crew") {
    const board = buildManningBoard(now);
    return listCrewMasters().map((m) => {
      const row = board.find((r) => r.crewMemberId === m.crewMemberId);
      const creds = credentialsOf("crew", m.crewMemberId);
      const license = creds.find((c) => c.category === "license");
      const basic = creds.find((c) => c.category === "stcw_basic");
      return [
        m.crewMemberId,
        m.name,
        m.nameKana ?? "",
        m.position ?? "",
        m.birthDate,
        row?.currentVesselName ?? "",
        license?.name ?? "—",
        license?.expiresOn ?? "",
        basic ? "修了" : "未修了",
        row
          ? row.eligibility.status === "blocked"
            ? "不可"
            : row.eligibility.status === "caution"
              ? "可（注意）"
              : "可"
          : "確認中",
      ];
    });
  }

  if (id === "manning") {
    const rows: string[][] = [];
    for (const ev of effective("embarkation")) {
      const master = listCrewMasters(true).find((m) => m.crewMemberId === ev.crewMemberId);
      rows.push([
        vesselNameOf(ev.targetVesselId),
        ev.crewMemberId,
        master?.name ?? ev.crewMemberId,
        ev.duty ?? "",
        ev.eventType === "on" ? ev.date : "",
        ev.eventType === "off" ? ev.date : "",
        ev.status === "actual" ? (ev.eventType === "on" ? "乗船中" : "下船済") : "計画",
      ]);
    }
    return rows;
  }

  if (id === "labor") {
    const d = buildShoreDashboard(now);
    const board = buildManningBoard(now);
    const rows: string[][] = [];
    for (const r of d.rows) {
      const vessel = board.find((b) => b.crewMemberId === r.crew.id)?.currentVesselName ?? "";
      for (const day of r.days) {
        if (!day.hasRecords) continue;
        const approval = r.approvalByDate[day.date];
        rows.push([
          day.date,
          vessel,
          r.crew.id,
          r.crew.name,
          fmtHoursShort(day.workedMinutes),
          fmtHoursShort(day.restTotalMinutes),
          LEVEL_LABEL[day.level] ?? day.level,
          approval ? (approval.decision === "approved" ? "承認済" : "差戻し") : "承認待",
        ]);
      }
    }
    return rows;
  }

  if (id === "shift") {
    const names = new Map(listCrewMasters(true).map((m) => [m.crewMemberId, m.name]));
    return currentShiftPlans().map((s): string[] => [
      vesselNameOf(s.vesselId),
      s.date ?? "",
      s.planType === "watch"
        ? `${s.from ?? ""}–${s.to ?? ""}`
        : (s.station ?? ""),
      s.crewMemberId,
      names.get(s.crewMemberId) ?? s.crewMemberId,
      s.planType === "watch" ? (s.shiftType ?? "当直") : (s.scenario ?? "配置"),
      s.publishedAt ? "配信済" : "作成中",
    ]);
  }

  if (id === "task") {
    return listTasks(now).map((r) => [
      r.task.id,
      r.task.title,
      r.vesselName,
      r.task.assigneeCrewId ?? "",
      r.assigneeName,
      r.task.dueAt ?? "",
      r.task.cycle ?? "",
      TASK_STATE_LABEL[r.task.state],
    ]);
  }

  if (id === "vessel") {
    const rows: string[][] = [];
    for (const v of listVessels()) {
      const master = effective("vessel_master").find((m) => m.targetVesselId === v.id);
      const creds = credentialsOf("vessel", v.id);
      const statuses = evaluateCredentials(creds, today, DEFAULT_CREDENTIAL_RULE_SET);
      if (creds.length === 0) {
        rows.push([
          v.name,
          String(master?.grossTonnage ?? ""),
          master?.vesselType ?? "",
          master?.imoNumber ?? "",
          String(master?.requiredCrew ?? ""),
          "—",
          "",
          "証書の登録なし",
        ]);
        continue;
      }
      for (const c of creds) {
        const st = statuses.find((s) => s.credential.id === c.id);
        rows.push([
          v.name,
          String(master?.grossTonnage ?? ""),
          master?.vesselType ?? "",
          master?.imoNumber ?? "",
          String(master?.requiredCrew ?? ""),
          c.name,
          c.expiresOn ?? "",
          st ? (LEVEL_LABEL[st.level] ?? st.level) : "",
        ]);
      }
    }
    return rows;
  }

  if (id === "standby") {
    const hours = (m: number) => (Math.round((m / 60) * 10) / 10).toString();
    return buildStandbySummary().map((r) => [
      r.month,
      r.port,
      String(r.standbyCount),
      String(r.standbyMinutes),
      hours(r.standbyMinutes),
      String(r.cargoCount),
      String(r.cargoMinutes),
      hours(r.cargoMinutes),
      String(r.openCount),
    ]);
  }

  // filing: 着手期限は導出値なので保持せず、ここでドメイン関数から取る（6.6②）
  return effective("procedure_task").map((p): string[] => [
    p.title,
    p.basis ?? "",
    p.subjectType === "company"
      ? "事業者"
      : p.subjectType === "vessel"
        ? vesselNameOf(p.subjectId ?? "")
        : (listCrewMasters(true).find((m) => m.crewMemberId === p.subjectId)?.name ?? p.subjectId ?? ""),
    p.dueOn ?? "",
    startDeadlineOf(p.dueOn, p.leadTimeDays) ?? "",
    PROCEDURE_STATUS_LABEL[p.status] ?? p.status,
    p.doneOn ?? "",
  ]);
}

/** CSV 文字列に組み立てる（区切り・引用の規則はここだけに置く） */
export function toCsv(columns: string[], rows: string[][], delimiter = ","): string {
  const esc = (v: string) =>
    /["\n\r]|,|\t/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = [columns.map(esc).join(delimiter)];
  for (const r of rows) lines.push(r.map(esc).join(delimiter));
  return lines.join("\r\n");
}

/** 既定のファイル名（拡張子なし）。利用者が書き換えられる */
export function exportFileBase(id: ExportSetId, now = new Date()): string {
  return `${exportSetById(id)?.label ?? id}_${todayLocal(now)}`;
}

export function exportFileName(id: ExportSetId, now = new Date(), format: ExportFormat = "csv"): string {
  return `${exportFileBase(id, now)}.${EXPORT_EXTENSION[format]}`;
}
