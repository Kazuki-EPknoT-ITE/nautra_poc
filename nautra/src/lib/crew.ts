import type { VesselRole } from "@/domain/authz/roles";

/**
 * デモ用の船員・船舶マスタ（PoC）。
 * 本番ではアプリ内マスタが正本（crew_members / vessels。要件定義書 12.2）となり、
 * 陸上画面 S-04 の単一経路で更新・Pull でマスタ配信される。
 */
export const DEMO_TENANT_ID = "tenant-demo";

export const DEMO_VESSEL = {
  id: "vessel-001",
  name: "第一のーとら丸",
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
   * PoC のデモ値。本番は Supabase Auth / IC カード / WebAuthn 等を運用選択制で用いる。
   */
  demoPin: string;
}

export const CREW_MEMBERS: CrewMember[] = [
  { id: "crew-kato", name: "加藤 大和", position: "船長", role: "captain", initial: "加", demoPin: "1111" },
  { id: "crew-sato", name: "佐藤 海斗", position: "航海士", role: "deck_officer", initial: "佐", demoPin: "2222" },
  { id: "crew-suzuki", name: "鈴木 港", position: "機関長", role: "chief_engineer", initial: "鈴", demoPin: "3333" },
  { id: "crew-tanaka", name: "田中 凪", position: "甲板部員", role: "deck_rating", initial: "田", demoPin: "4444" },
];

export function crewById(id: string): CrewMember | undefined {
  return CREW_MEMBERS.find((c) => c.id === id);
}

/** 陸上スタッフ（シフト作成・配信者。S-10 の操作者） */
export const SHORE_PLANNER_ID = "shore-yamamoto";
export const SHORE_STAFF = [
  { id: SHORE_PLANNER_ID, name: "山本 陸", position: "運航管理（陸上）" },
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
