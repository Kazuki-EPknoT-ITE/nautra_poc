import { describe, expect, it } from "vitest";
import { deriveVoyageActual, type TrackPoint } from "../voyage-actual";

/** 配船の計画と航跡の突き合わせ（POS-02）。デモの V-2026-041（横浜 → 名古屋）と同じ形 */
const T = (h: number) => new Date(Date.UTC(2026, 9, 8, h)).toISOString();

const track: TrackPoint[] = [
  { observedAt: T(9), navStatus: "moored", speedKnots: 0 },
  { observedAt: T(12), navStatus: "underway", speedKnots: 11.5 },
  { observedAt: T(18), navStatus: "underway", speedKnots: 6.2 },
  { observedAt: T(33), navStatus: "anchored", speedKnots: 0 },
];

describe("配船の計画と航跡の突き合わせ", () => {
  it("出港は最初に動いた観測、入港はそのあと最初に止まった観測。遅れは分で返す", () => {
    const r = deriveVoyageActual(T(6), T(18), track);
    expect(r.state).toBe("arrived");
    expect(r.actualDepartureAt).toBe(T(12));
    expect(r.actualArrivalAt).toBe(T(33));
    expect(r.departureDelayMin).toBe(6 * 60);
    expect(r.arrivalDelayMin).toBe(15 * 60);
  });

  it.each([
    ["窓の中に観測が無ければ no_data", T(100), T(110), "no_data"],
    ["止まった観測しか無ければ not_departed", T(0), T(8), "not_departed"],
  ])("%s", (_n, dep, arr, state) => {
    expect(deriveVoyageActual(dep, arr, state === "not_departed" ? [track[0]!] : track).state).toBe(state);
  });

  it("動いているが、まだ止まった観測が無ければ航海中（入港の実績は無し）", () => {
    const r = deriveVoyageActual(T(6), T(18), track.slice(0, 3));
    expect(r.state).toBe("underway");
    expect(r.actualArrivalAt).toBeNull();
    expect(r.arrivalDelayMin).toBeNull();
  });

  it("早く出れば遅れは負（前倒し）", () => {
    const r = deriveVoyageActual(T(14), T(30), track);
    expect(r.departureDelayMin).toBe(-2 * 60);
  });
});
