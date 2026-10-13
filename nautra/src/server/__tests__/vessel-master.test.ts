import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * 船の登録（レビュー VESSEL-02 / VESSEL-03 / ASSIGN-04）。
 * 登録した船が配乗計画などの画面にそのまま出ること、編集が追記型であること、写真が別エンティティであること。
 */

type Svc = typeof import("@/server/vessel-master-service");
type Master = typeof import("@/server/master-service");
type Manning = typeof import("@/server/manning-service");

let svc: Svc;
let master: Master;
let manning: Manning;
const ACTOR = "shore-fujii";
const EMPTY = {
  name: "",
  vesselType: "",
  grossTonnage: "",
  imoNumber: "",
  mmsi: "",
  navigationArea: "",
  requiredCrew: "",
  builtOn: "",
  referencePeriodDays: "",
};

beforeAll(async () => {
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "nautra-vessel-")));
  svc = await import("@/server/vessel-master-service");
  master = await import("@/server/master-service");
  manning = await import("@/server/manning-service");
});

describe("船の登録", () => {
  it.each([
    ["船名が空", { name: "" }, /船名/],
    ["IMO番号が7桁でない", { name: "試験丸", imoNumber: "123" }, /IMO番号は7桁/],
    ["MMSI が9桁でない", { name: "試験丸", mmsi: "12" }, /MMSI は9桁/],
    ["総トン数が数でない", { name: "試験丸", grossTonnage: "大きい" }, /総トン数/],
  ])("%s なら登録できない", (_n, form, error) => {
    expect(() => svc.createVesselMaster({ form: { ...EMPTY, ...form }, actor: ACTOR })).toThrow(error);
  });

  it("登録した船は船の一覧と配乗ボードに出て、監査ログに残る", () => {
    const { vesselId } = svc.createVesselMaster({
      form: { ...EMPTY, name: "試験丸", vesselType: "貨物船", grossTonnage: "499", requiredCrew: "5", imoNumber: "9876543" },
      actor: ACTOR,
    });
    expect(master.listVessels().some((v) => v.id === vesselId && v.name === "試験丸")).toBe(true);
    expect(master.vesselMasterOf(vesselId)).toMatchObject({
      grossTonnage: 499,
      requiredCrew: 5,
      vesselType: "貨物船",
      imoNumber: "IMO 9876543", // 既存データと同じ形で持つ
    });
    expect(manning.buildVesselManning().some((v) => v.vesselId === vesselId)).toBe(true);
    expect(master.listAuditLogs(20).some((l) => l.summary === "船を登録: 試験丸")).toBe(true);
    // 同じ名前の二重登録は断る
    expect(() => svc.createVesselMaster({ form: { ...EMPTY, name: "試験丸" }, actor: ACTOR })).toThrow(/既に登録/);
  });

  it("デモの船（IMO を「IMO 9612345」の形で持つ）も、そのまま開いて保存できる", () => {
    const m = master.vesselMasterOf("vessel-001")!;
    expect(() =>
      svc.updateVesselMaster({
        vesselId: "vessel-001",
        form: { ...EMPTY, name: m.name, imoNumber: m.imoNumber ?? "", mmsi: m.mmsi ?? "" },
        actor: ACTOR,
      }),
    ).not.toThrow();
  });

  it("編集は追記型（前の版を残す）で、変わった項目だけを返す", () => {
    const v = master.listVessels().find((x) => x.name === "試験丸")!;
    const before = master.vesselMasterOf(v.id)!;
    const { changed } = svc.updateVesselMaster({
      vesselId: v.id,
      form: { ...EMPTY, name: "試験丸", vesselType: "貨物船", grossTonnage: "520", requiredCrew: "5", imoNumber: "9876543" },
      actor: ACTOR,
    });
    expect(changed).toEqual(["総トン数"]);
    const after = master.vesselMasterOf(v.id)!;
    expect(after.supersedesId).toBe(before.id);
    expect(after.grossTonnage).toBe(520);
    // 何も変えなければ版を増やさない
    expect(
      svc.updateVesselMaster({
        vesselId: v.id,
        form: { ...EMPTY, name: "試験丸", vesselType: "貨物船", grossTonnage: "520", requiredCrew: "5", imoNumber: "9876543" },
        actor: ACTOR,
      }).changed,
    ).toEqual([]);
  });

  it("写真は船舶マスタとは別に持ち、外すのも追記で表す", () => {
    const v = master.listVessels().find((x) => x.name === "試験丸")!;
    const masterId = master.vesselMasterOf(v.id)!.id;
    svc.saveVesselPhoto({ vesselId: v.id, dataUrl: "data:image/jpeg;base64,AAAA", actor: ACTOR });
    expect(svc.vesselPhotoOf(v.id)).toBe("data:image/jpeg;base64,AAAA");
    expect(master.vesselMasterOf(v.id)!.id).toBe(masterId); // マスタの版は増えない
    expect(svc.saveVesselPhoto({ vesselId: v.id, dataUrl: "data:image/jpeg;base64,AAAA", actor: ACTOR })).toBeNull();
    svc.saveVesselPhoto({ vesselId: v.id, dataUrl: "", actor: ACTOR });
    expect(svc.vesselPhotoOf(v.id)).toBeUndefined();
    expect(() => svc.saveVesselPhoto({ vesselId: v.id, dataUrl: "not-an-image", actor: ACTOR })).toThrow(/画像/);
  });
});
