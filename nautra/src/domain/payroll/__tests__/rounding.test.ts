import { describe, expect, it } from "vitest";
import { roundMinutes, roundingEffect, type RoundingMode } from "../rounding";

/**
 * 給与連携のまるめ時間のテスト（要件定義書 3.6.2）。
 * まるめは給与へ渡す値の変換であり、打刻（一次記録）は変わらない。
 */
describe("まるめ時間（給与連携）", () => {
  const cases: [string, number, number, RoundingMode, number][] = [
    ["15分単位・四捨五入: 7分は切り捨てられ 0分になる", 7, 15, "nearest", 0],
    ["15分単位・四捨五入: 8分は切り上がり 15分になる", 8, 15, "nearest", 15],
    ["15分単位・四捨五入: ちょうど半分（7.5分）は労働者に不利にならない側へ切り上げる", 7.5, 15, "nearest", 15],
    ["15分単位・切り捨て: 14分は 0分になる（実働より少なくなる）", 14, 15, "floor", 0],
    ["15分単位・切り上げ: 1分でも 15分になる", 1, 15, "ceil", 15],
    ["30分単位・四捨五入: 1時間45分（105分）はちょうど半分なので 120分へ切り上がる", 105, 30, "nearest", 120],
    ["30分単位・四捨五入: 1時間44分（104分）は 90分へ切り下がる", 104, 30, "nearest", 90],
    ["30分単位・四捨五入: 1時間50分（110分）は 120分になる", 110, 30, "nearest", 120],
    ["単位ちょうどの実績はどのまるめ方でも変わらない", 60, 15, "floor", 60],
  ];

  it.each(cases)("%s", (_name, minutes, unit, mode, expected) => {
    expect(roundMinutes(minutes, unit, mode)).toBe(expected);
  });

  it("まるめ単位が1分以下なら実績をそのまま返す（まるめない設定）", () => {
    expect(roundMinutes(137, 1)).toBe(137);
    expect(roundMinutes(137, 0)).toBe(137);
    expect(roundMinutes(137, -5)).toBe(137);
  });

  it("実績が0または負なら0を返す（時間外は負にならない）", () => {
    expect(roundMinutes(0, 15)).toBe(0);
    expect(roundMinutes(-30, 15)).toBe(0);
    expect(roundMinutes(Number.NaN, 15)).toBe(0);
  });

  it("まるめの前後と増減をまとめて返す（画面で影響が見えるようにする）", () => {
    const effect = roundingEffect(1858, 15, "nearest");
    expect(effect.rawMinutes).toBe(1858);
    expect(effect.roundedMinutes).toBe(1860);
    expect(effect.diffMinutes).toBe(2);
    expect(effect.unitMinutes).toBe(15);
    expect(effect.mode).toBe("nearest");
  });

  it("切り捨て設定では増減がマイナス（実働より少ない）になることが分かる", () => {
    const effect = roundingEffect(1858, 15, "floor");
    expect(effect.roundedMinutes).toBe(1845);
    expect(effect.diffMinutes).toBe(-13);
  });
});
