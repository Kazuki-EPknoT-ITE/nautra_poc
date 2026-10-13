import type { VesselRole } from "@/domain/authz/roles";

/**
 * デモ用の船員・船舶マスタ（PoC）。名前・船名はデザイン正本 `design/poc_design` に合わせる。
 * 本番ではアプリ内マスタが正本（crew_members / vessels。要件定義書 12.2）となり、
 * 陸上画面 S-04 の単一経路で更新・Pull でマスタ配信される。
 */
export const DEMO_TENANT_ID = "tenant-demo";

/** 事業者（デザインの「昭運海運株式会社」） */
export const DEMO_COMPANY = "昭運海運株式会社";

export const DEMO_VESSEL = {
  id: "vessel-001",
  name: "第一昭運丸",
} as const;

export type CrewRole = VesselRole;

export interface CrewMember {
  id: string;
  name: string;
  /** 職名（表示用） */
  position: string;
  /** 権限ロール（判定は src/domain/authz） */
  role: CrewRole;
  /** アバター表示用イニシャル（顔写真リスト選択方式の代替。基本設計書 11.3） */
  initial: string;
  /**
   * 船内共用端末のサインイン用 PIN（基本設計書 11.3「顔写真リストから選択+任意で PIN」）。
   * **船員ごとに異なる**値を持たせ、4桁目の入力で自動照合する（デザイン正本）。
   * PoC のデモ値。本番は Supabase Auth / IC カード等を運用選択制で用いる。
   */
  demoPin: string;
}

/**
 * 第一昭運丸の乗組員（船内アプリのサインイン一覧）。
 * 配乗待ち・他船の船員はここに出さない（共用端末に無関係な氏名を並べない）。
 */
export const CREW_MEMBERS: CrewMember[] = [
  { id: "crew-takamatsu", name: "高松 誠", position: "船長", role: "captain", initial: "高", demoPin: "1111" },
  { id: "crew-terada", name: "寺田 稔", position: "機関長", role: "chief_engineer", initial: "寺", demoPin: "2222" },
  { id: "crew-nakahara", name: "中原 拓也", position: "一等航海士", role: "deck_officer", initial: "中", demoPin: "3333" },
  { id: "crew-oshiro", name: "大城 稜", position: "甲板員", role: "deck_rating", initial: "大", demoPin: "4444" },
];

export function crewById(id: string): CrewMember | undefined {
  return CREW_MEMBERS.find((c) => c.id === id);
}

/** 陸上スタッフ（シフト作成・配信者。S-10 の操作者） */
export const SHORE_PLANNER_ID = "shore-fujii";
export const SHORE_STAFF = [
  { id: SHORE_PLANNER_ID, name: "藤井 圭", position: "運航担当（陸上）" },
  { id: "shore-shiraishi", name: "白石 千夏", position: "労務担当（陸上）" },
  { id: "shore-taniguchi", name: "谷口 亮子", position: "労務管理責任者（陸上）" },
  { id: "shore-okamoto", name: "岡本 遥", position: "経理・事務（陸上）" },
  { id: "shore-yamaguchi", name: "山口 隆", position: "海務部長（陸上）" },
] as const;

/** ID → 表示名（船員・陸上スタッフ双方。未知IDはそのまま返す） */
export function personName(id: string | undefined): string {
  if (!id) return "—";
  const crew = crewById(id);
  if (crew) return crew.name;
  const staff = SHORE_STAFF.find((s) => s.id === id);
  if (staff) return staff.name;
  return id;
}
