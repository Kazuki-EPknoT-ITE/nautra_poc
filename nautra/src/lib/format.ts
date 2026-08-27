/** 分 → 「9時間30分」表記 */
export function fmtMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

/** 分 → 「9.5h」短縮表記（ゲージ等の密な表示用） */
export function fmtHoursShort(minutes: number): string {
  const h = minutes / 60;
  return `${(Math.round(h * 10) / 10).toString()}h`;
}

/** ISO → ローカル "HH:MM" */
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** ISO → ローカル "M/D HH:MM" */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${fmtTime(iso)}`;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** YYYY-MM-DD → "8/10(月)" */
export function fmtDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}/${d}(${WEEKDAYS[date.getDay()]})`;
}

/** Date → <input type="datetime-local"> 用 "YYYY-MM-DDTHH:MM"（ローカル） */
export function toLocalInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:MM"（ローカル） → Date。不正なら null */
export function fromLocalInputValue(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 数値入力 → number | undefined（空・不正は undefined） */
export function parseOptionalNumber(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** ISO → ローカル "HH:MM:SS"（打刻の証跡は秒まで表示する） */
export function fmtTimeSec(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 経過ミリ秒 → "H:MM:SS"（作業中の経過表示） */
export function fmtElapsedClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${h}:${p(m)}:${p(s)}`;
}

/** ISO → ローカル "M/D HH:MM:SS"（履歴表示） */
export function fmtDateTimeSec(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${fmtTimeSec(iso)}`;
}
