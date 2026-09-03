import type { CheckLevel } from "@/domain/labor-law/types";

/**
 * S-12 配船・位置情報の導出と言い換え（純関数。UI・DB 非依存）。
 *
 * 要件定義書 3.7.1 の留意点:
 *   「無償AISサービスは可用性・データ品質のSLAがないため、**配船判断の参考情報**と位置づけ、
 *    商用APIへの差替え可能なアダプタ設計とする」
 * これを満たすため、
 *  - 観測が古いものは「情報が古い可能性があります」と表示できるよう鮮度を判定する
 *  - 取得そのものは `src/server/position-service.ts` のアダプタに閉じ、
 *    ここには**受け取った位置の解釈**だけを置く
 *
 * 地図は外部のタイル・ライブラリを使わない（オフライン前提・CSP）。
 * 日本近海の矩形に緯度経度を線形写像した簡易海図を SVG で描くため、
 * その写像もここに純関数として置く（画面は座標計算を持たない）。
 */

/* ═══════════════ 位置の鮮度（3.7.1 参考情報としての扱い） ═══════════════ */

/**
 * 観測がこの分数より古ければ「情報が古い可能性があります」と注意する。
 * 無償 AIS の受信間隔・欠測を見込んだ**運用上の目安**であり、法令の閾値ではない。
 * 商用 API へ差し替えたら短くできるよう、引数で差し替えられる。
 */
export const POSITION_STALE_MINUTES = 180;

export interface PositionFreshness {
  /** 観測からの経過分数 */
  ageMinutes: number;
  stale: boolean;
  level: CheckLevel;
  message: string;
}

/** 経過分数 → 「3時間20分前」のような日常語 */
export function describeAge(minutes: number): string {
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m === 0 ? `${h}時間前` : `${h}時間${m}分前`;
  const d = Math.floor(h / 24);
  return `${d}日前`;
}

export function evaluatePositionFreshness(
  observedAt: string,
  now: Date,
  staleMinutes: number = POSITION_STALE_MINUTES,
): PositionFreshness {
  const ageMinutes = Math.max(0, Math.round((now.getTime() - new Date(observedAt).getTime()) / 60000));
  const stale = ageMinutes > staleMinutes;
  return {
    ageMinutes,
    stale,
    level: stale ? "caution" : "ok",
    message: stale
      ? `${describeAge(ageMinutes)}の情報です。情報が古い可能性があります（配船の判断は他の連絡でも確かめてください）`
      : `${describeAge(ageMinutes)}に受信した位置です`,
  };
}

/* ═══════════════ 簡易海図への写像（日本近海の矩形） ═══════════════ */

/** 描画範囲（北緯30〜46度 / 東経128〜146度） */
export const CHART_BOUNDS = { minLat: 30, maxLat: 46, minLon: 128, maxLon: 146 } as const;

/**
 * SVG の内部座標。緯度1度と経度1度の実距離比（北緯38度付近で経度1度 ≒ 緯度1度 × cos38°）を
 * 反映し、極端に横伸びしないようにしている。
 */
export const CHART_SIZE = { width: 1000, height: 1134 } as const;

export interface ChartPoint {
  x: number;
  y: number;
  /** 描画範囲の外か（外なら端に丸めた座標を返しつつ、この印で注記できる） */
  outside: boolean;
}

/** 緯度経度 → SVG 座標（線形写像。範囲外は端に丸める） */
export function projectToChart(lat: number, lon: number): ChartPoint {
  const { minLat, maxLat, minLon, maxLon } = CHART_BOUNDS;
  const outside = lat < minLat || lat > maxLat || lon < minLon || lon > maxLon;
  const clampedLat = Math.min(maxLat, Math.max(minLat, lat));
  const clampedLon = Math.min(maxLon, Math.max(minLon, lon));
  return {
    x: ((clampedLon - minLon) / (maxLon - minLon)) * CHART_SIZE.width,
    y: ((maxLat - clampedLat) / (maxLat - minLat)) * CHART_SIZE.height,
    outside,
  };
}

/** 目印にする主要港（海岸線を描かないため、現在地を読む手がかりにする） */
export const MAJOR_PORTS: { name: string; lat: number; lon: number }[] = [
  { name: "横浜", lat: 35.45, lon: 139.65 },
  { name: "名古屋", lat: 35.05, lon: 136.87 },
  { name: "大阪", lat: 34.65, lon: 135.43 },
  { name: "神戸", lat: 34.68, lon: 135.19 },
  { name: "水島", lat: 34.51, lon: 133.72 },
  { name: "尾道", lat: 34.4, lon: 133.2 },
  { name: "松山", lat: 33.87, lon: 132.71 },
];

/** グリッド線を引く緯度（2度おき） */
export function chartLatLines(step = 2): number[] {
  const out: number[] = [];
  for (let v = CHART_BOUNDS.minLat; v <= CHART_BOUNDS.maxLat; v += step) out.push(v);
  return out;
}

/** グリッド線を引く経度（2度おき） */
export function chartLonLines(step = 2): number[] {
  const out: number[] = [];
  for (let v = CHART_BOUNDS.minLon; v <= CHART_BOUNDS.maxLon; v += step) out.push(v);
  return out;
}

/** 緯度経度の表示（例: 北緯35.05度 東経136.87度） */
export function fmtLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? "北緯" : "南緯";
  const ew = lon >= 0 ? "東経" : "西経";
  return `${ns}${Math.abs(lat).toFixed(3)}度 ${ew}${Math.abs(lon).toFixed(3)}度`;
}

/* ═══════════════ 3.7.2③ 配乗状況との突き合わせ ═══════════════ */

export interface CrewChangeWarning {
  crewMemberId: string;
  /** 下船（または乗船）の予定日 */
  date: string;
  eventType: "on" | "off";
  duty?: string;
}

/**
 * 航海の期間に乗下船の予定が重なるかを判定する（3.7.2 サブプロセス③）。
 * 期間は日付（YYYY-MM-DD）で比較する。
 */
export function crewChangesInPeriod(
  changes: CrewChangeWarning[],
  fromYmd: string,
  toYmd: string,
): CrewChangeWarning[] {
  const [lo, hi] = fromYmd <= toYmd ? [fromYmd, toYmd] : [toYmd, fromYmd];
  return changes.filter((c) => c.date >= lo && c.date <= hi);
}
