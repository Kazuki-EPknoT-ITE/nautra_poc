/**
 * 配船の計画と、実際に船がたどった航跡の突き合わせ（レビュー POS-02）。純関数（UI・DB 非依存）。
 *
 * 航跡は AIS/GPS の観測点の並び（間隔は不揃い）なので、出港・入港の「実際の時刻」は
 * **観測で確かめられた時刻**として出す:
 * - 出港 = 計画の出港の 24時間前〜入港の 48時間後のあいだで、最初に「動いている」観測
 * - 入港 = 出港のあとで、最初に「止まっている」観測（係留・錨泊・荷役中、または速力 1 ノット未満）
 * 観測の間隔がそのまま誤差になるため、画面では「観測で確認」と添える。判定はしない（参考情報。3.7.1）。
 */

export interface TrackPoint {
  observedAt: string;
  navStatus?: "underway" | "moored" | "cargo_ops" | "anchored" | "unknown";
  speedKnots?: number;
}

export type VoyageActualState = "no_data" | "not_departed" | "underway" | "arrived";

export interface VoyageActual {
  state: VoyageActualState;
  actualDepartureAt: string | null;
  actualArrivalAt: string | null;
  /** 実際 − 計画（分）。遅れが正。実績が無ければ null */
  departureDelayMin: number | null;
  arrivalDelayMin: number | null;
  /** 突き合わせに使った観測の数 */
  observations: number;
}

const HOUR = 3_600_000;

const moving = (p: TrackPoint) =>
  p.navStatus === "underway" || (p.navStatus !== "moored" && p.navStatus !== "anchored" && p.navStatus !== "cargo_ops" && (p.speedKnots ?? 0) >= 1);
const stopped = (p: TrackPoint) =>
  p.navStatus === "moored" || p.navStatus === "anchored" || p.navStatus === "cargo_ops" || (p.navStatus !== "underway" && (p.speedKnots ?? 99) < 1);

export function deriveVoyageActual(
  plannedDepartureAt: string,
  plannedArrivalAt: string,
  track: readonly TrackPoint[],
): VoyageActual {
  const dep = new Date(plannedDepartureAt).getTime();
  const arr = new Date(plannedArrivalAt).getTime();
  const inWindow = [...track]
    .filter((p) => {
      const t = new Date(p.observedAt).getTime();
      return t >= dep - 24 * HOUR && t <= arr + 48 * HOUR;
    })
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));

  if (inWindow.length === 0) {
    return { state: "no_data", actualDepartureAt: null, actualArrivalAt: null, departureDelayMin: null, arrivalDelayMin: null, observations: 0 };
  }
  const departure = inWindow.find(moving) ?? null;
  const arrival = departure ? (inWindow.find((p) => p.observedAt > departure.observedAt && stopped(p)) ?? null) : null;
  const delay = (actual: TrackPoint | null, planned: number) =>
    actual ? Math.round((new Date(actual.observedAt).getTime() - planned) / 60_000) : null;

  return {
    state: !departure ? "not_departed" : arrival ? "arrived" : "underway",
    actualDepartureAt: departure?.observedAt ?? null,
    actualArrivalAt: arrival?.observedAt ?? null,
    departureDelayMin: delay(departure, dep),
    arrivalDelayMin: delay(arrival, arr),
    observations: inWindow.length,
  };
}
