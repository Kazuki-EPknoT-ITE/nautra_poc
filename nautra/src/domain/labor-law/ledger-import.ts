import type { WorkCategory } from "./types";
import { WORK_CATEGORIES } from "./types";

/**
 * 国交省公表の労務管理記録簿 Excel マクロ様式からの取込（要件定義書 3.2.2 最終項目
 * 「既に Excel マクロで運用中の事業者からの移行を容易にする」）。
 *
 * 方針:
 * - **外部ライブラリを増やさない**ため、Excel 様式を「CSV として保存したもの」を受け取る。
 *   .xlsx の解凍・解析を自前で持つと、様式の版差で壊れたときに現場で直せない。
 * - この関数は**純関数**（UI・DB・fetch 非依存）。列の解釈と検証だけを担い、
 *   取り込み（打刻レコードの追記）は呼び出し側のサービスが行う。
 * - **不正な行は理由つきで弾き、正常な行だけを返す**。ファイル全体を落とさない
 *   （移行作業は数百行あり、1行の誤りで全部やり直しになると使えない）。
 * - 事業者ごとに列名が揺れるため、列は**見出し行から別名表で解決**する。
 */

export type LedgerColumn = "date" | "crew" | "category" | "start" | "end" | "note";

export const LEDGER_COLUMNS: LedgerColumn[] = ["date", "crew", "category", "start", "end", "note"];

/** 見出しの別名。正規化（空白除去・小文字化）した見出しに**含まれていれば**その列とみなす */
const COLUMN_ALIASES: Record<LedgerColumn, string[]> = {
  date: ["日付", "年月日", "月日", "date"],
  crew: ["船員", "氏名", "名前", "crew", "name"],
  category: ["作業種別", "業務内容", "作業内容", "種別", "作業", "category", "work"],
  start: ["開始", "始業", "from", "start"],
  end: ["終了", "終業", "to", "end"],
  note: ["備考", "摘要", "note", "remark"],
};

/** 取込に必要な列（備考は任意） */
const REQUIRED_COLUMNS: LedgerColumn[] = ["date", "crew", "category", "start", "end"];

export interface LedgerImportRow {
  /** 元ファイルの行番号（1始まり。プレビューで場所を示す） */
  line: number;
  date: string;
  crewMemberId: string;
  workCategory: WorkCategory;
  /** HH:MM */
  start: string;
  /** HH:MM（24:00 = その日の終わりを表す） */
  end: string;
  note?: string;
  /** 重複判定に使う行キー（取込済みの再取込を検出する） */
  key: string;
}

export interface LedgerImportIssue {
  line: number;
  raw: string;
  reason: string;
}

export interface LedgerImportResult {
  /** 取り込める行 */
  rows: LedgerImportRow[];
  /** 弾いた行と理由 */
  issues: LedgerImportIssue[];
  /** 見出し行で解決した列（列 → 0始まりの位置） */
  columns: Partial<Record<LedgerColumn, number>>;
  /** 見出し行の行番号（見つからなければ null） */
  headerLine: number | null;
  /** 空行として読み飛ばした行数 */
  skipped: number;
}

export interface LedgerImportOptions {
  /** 取り込んでよい船員ID */
  crewIds: string[];
  /** 表記 → 船員ID（氏名で書かれた様式に対応。呼び出し側がマスタから作る） */
  crewAliases?: Record<string, string>;
  /** 表記 → 作業種別（「航海当直」等。呼び出し側が i18n から作る。ドメインは語彙を持たない） */
  categoryAliases?: Record<string, WorkCategory>;
  /** すでに取り込み済みの行キー（再取込の重複を検出する） */
  existingKeys?: Set<string>;
}

/** 行キー（船員・日付・種別・時間帯が同じなら同じ勤務） */
export function ledgerRowKey(r: {
  crewMemberId: string;
  date: string;
  workCategory: WorkCategory;
  start: string;
  end: string;
}): string {
  return `${r.crewMemberId}|${r.date}|${r.workCategory}|${r.start}|${r.end}`;
}

/* ═══════════════ 文字列の正規化 ═══════════════ */

/** 全角英数字・記号を半角へ。事業者の Excel は全角と半角が混在する */
function toHalfWidth(s: string): string {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[　]/g, " ")
    .replace(/[：]/g, ":")
    .replace(/[／]/g, "/")
    // 全角ハイフン・マイナス記号のみを半角へ。カタカナの長音符（ー）は氏名を壊すので触らない
    .replace(/[－−‐]/g, "-");
}

function normalizeHeader(s: string): string {
  return toHalfWidth(s).replace(/\s+/g, "").toLowerCase();
}

/** 見出し・値の突き合わせ用（空白除去のみ。表示は元の文字列を使う） */
function normalizeValue(s: string): string {
  return toHalfWidth(s).trim().replace(/\s+/g, "");
}

/** 日付の正規化。`2026/4/1` `2026年4月1日` `2026-04-01` を受ける */
export function normalizeLedgerDate(raw: string): string | null {
  const s = toHalfWidth(raw)
    .trim()
    .replace(/年|\//g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "");
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 時刻の正規化。`9:00` `09:00` `0900` `9時00分` `24:00` を受ける */
export function normalizeLedgerTime(raw: string): string | null {
  const s = toHalfWidth(raw).trim().replace(/時/g, ":").replace(/分/g, "");
  let h: number;
  let mi: number;
  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  const digits = /^(\d{2})(\d{2})$/.exec(s);
  if (colon) {
    h = Number(colon[1]);
    mi = Number(colon[2]);
  } else if (digits) {
    h = Number(digits[1]);
    mi = Number(digits[2]);
  } else {
    return null;
  }
  if (mi < 0 || mi > 59) return null;
  if (h < 0 || h > 24) return null;
  if (h === 24 && mi !== 0) return null; // 24:00 のみ「その日の終わり」として許す
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/** HH:MM → その日の 0時からの分数（24:00 = 1440） */
export function ledgerMinutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/* ═══════════════ CSV の読み取り ═══════════════ */

interface CsvRecord {
  line: number;
  cells: string[];
  raw: string;
}

/**
 * CSV を行に分解する（引用符・引用符内の改行・CRLF・BOM に対応）。
 * 依存を増やさないための最小実装。区切りはカンマ固定（Excel の「CSV UTF-8」既定）。
 */
export function parseCsvRecords(text: string): CsvRecord[] {
  const src = text.replace(/^﻿/, "");
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let raw = "";
  let line = 1;
  let startLine = 1;
  let quoted = false;

  const pushRecord = () => {
    cells.push(cell);
    records.push({ line: startLine, cells, raw });
    cells = [];
    cell = "";
    raw = "";
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          raw += '""';
          i++;
        } else {
          quoted = false;
          raw += '"';
        }
      } else {
        if (c === "\n") line++;
        cell += c;
        raw += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
      raw += '"';
    } else if (c === ",") {
      cells.push(cell);
      cell = "";
      raw += c;
    } else if (c === "\r") {
      // CRLF の CR は読み飛ばす
    } else if (c === "\n") {
      pushRecord();
      line++;
      startLine = line;
    } else {
      cell += c;
      raw += c;
    }
  }
  if (cell !== "" || cells.length > 0 || raw !== "") pushRecord();
  return records;
}

/** 見出し行から列位置を解決する */
export function resolveLedgerColumns(cells: string[]): Partial<Record<LedgerColumn, number>> {
  const columns: Partial<Record<LedgerColumn, number>> = {};
  cells.forEach((cell, index) => {
    const h = normalizeHeader(cell);
    if (!h) return;
    for (const col of LEDGER_COLUMNS) {
      if (columns[col] !== undefined) continue;
      if (COLUMN_ALIASES[col].some((alias) => h.includes(alias))) {
        columns[col] = index;
        return;
      }
    }
  });
  return columns;
}

function isBlank(cells: string[]): boolean {
  return cells.every((c) => c.trim() === "");
}

/**
 * Excel マクロ様式（CSV 保存）を読み取り、取り込める行と弾いた行を返す。
 * 呼び出し側は `rows` を打刻レコードとして**追記**する（既存レコードは上書きしない）。
 */
export function parseLedgerCsv(
  text: string,
  options: LedgerImportOptions,
): LedgerImportResult {
  const result: LedgerImportResult = {
    rows: [],
    issues: [],
    columns: {},
    headerLine: null,
    skipped: 0,
  };
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    result.issues.push({ line: 0, raw: "", reason: "ファイルが空です" });
    return result;
  }

  // 見出し行を探す（様式の上部に船舶名などの説明行が入ることがある）
  let headerIndex = -1;
  for (let i = 0; i < records.length; i++) {
    const columns = resolveLedgerColumns(records[i].cells);
    if (REQUIRED_COLUMNS.every((c) => columns[c] !== undefined)) {
      headerIndex = i;
      result.columns = columns;
      result.headerLine = records[i].line;
      break;
    }
  }
  if (headerIndex < 0) {
    result.issues.push({
      line: 0,
      raw: "",
      reason:
        "見出し行が見つかりません（日付・船員・作業種別・開始・終了 の列がある行が必要です）",
    });
    return result;
  }

  const crewIds = new Set(options.crewIds);
  const crewAliases = new Map<string, string>();
  for (const [alias, id] of Object.entries(options.crewAliases ?? {})) {
    crewAliases.set(normalizeValue(alias), id);
  }
  const categoryAliases = new Map<string, WorkCategory>();
  for (const c of WORK_CATEGORIES) categoryAliases.set(c, c); // キー直書きの様式も受ける
  for (const [alias, cat] of Object.entries(options.categoryAliases ?? {})) {
    categoryAliases.set(normalizeValue(alias), cat);
  }

  const seen = new Set<string>();
  const col = result.columns;

  for (let i = headerIndex + 1; i < records.length; i++) {
    const rec = records[i];
    if (isBlank(rec.cells)) {
      result.skipped += 1;
      continue;
    }
    const at = (c: LedgerColumn): string => {
      const idx = col[c];
      return idx === undefined ? "" : (rec.cells[idx] ?? "");
    };
    const fail = (reason: string) => result.issues.push({ line: rec.line, raw: rec.raw, reason });

    const date = normalizeLedgerDate(at("date"));
    if (!date) {
      fail(`日付を読み取れません（${at("date").trim() || "空欄"}）`);
      continue;
    }

    const crewRaw = at("crew").trim();
    const crewKey = normalizeValue(crewRaw);
    const crewMemberId = crewIds.has(crewRaw)
      ? crewRaw
      : (crewAliases.get(crewKey) ?? (crewIds.has(crewKey) ? crewKey : undefined));
    if (!crewMemberId) {
      fail(`登録されていない船員です（${crewRaw || "空欄"}）`);
      continue;
    }

    const catRaw = at("category").trim();
    const workCategory = categoryAliases.get(normalizeValue(catRaw));
    if (!workCategory) {
      fail(`作業種別を読み取れません（${catRaw || "空欄"}）`);
      continue;
    }

    const start = normalizeLedgerTime(at("start"));
    if (!start) {
      fail(`開始時刻を読み取れません（${at("start").trim() || "空欄"}）`);
      continue;
    }
    const end = normalizeLedgerTime(at("end"));
    if (!end) {
      fail(`終了時刻を読み取れません（${at("end").trim() || "空欄"}）`);
      continue;
    }
    if (ledgerMinutesOf(end) <= ledgerMinutesOf(start)) {
      fail(
        `終了が開始より後になっていません（${start}→${end}）。日をまたぐ勤務は日ごとの行に分けてください`,
      );
      continue;
    }

    const key = ledgerRowKey({ crewMemberId, date, workCategory, start, end });
    if (seen.has(key)) {
      fail(`同じ内容の行がこのファイルにすでにあります（${date} ${start}–${end}）`);
      continue;
    }
    if (options.existingKeys?.has(key)) {
      fail(`この勤務は取込済みです（${date} ${start}–${end}）`);
      continue;
    }
    seen.add(key);

    const note = at("note").trim();
    result.rows.push({
      line: rec.line,
      date,
      crewMemberId,
      workCategory,
      start,
      end,
      note: note || undefined,
      key,
    });
  }

  return result;
}
