import type { ShoreRole } from "@/domain/authz/shore-roles";

/**
 * デモの陸上スタッフ（本番は users テーブル + Supabase Auth）。
 * 氏名・メール・肩書きはデザイン正本 `design/poc_design` の S-15 ユーザー一覧に合わせる。
 *
 * これは**アカウントの種**で、正本ではない。実際の状態（ロール変更・無効化・
 * パスワード・招待されたアカウント）は追記型の `shore_user` エンティティが持ち、
 * 同じ `id` の行があればそちらが勝つ（`server/shore-user-service.ts`）。
 * 種を別ファイルに置いているのは、`shore-session.ts` → `shore-user-service.ts` →
 * 種 の向きを一方通行にして循環 import を作らないため。
 *
 * 承認は労務管理責任者の役割（要件定義書 3.2）。`labor_manager` を持つ人が2名いるのは
 * 実務どおりで、**日々の起票は労務担当（白石）、最終確認は責任者（谷口）**が行う。
 */
export interface SeedShoreStaff {
  id: string;
  name: string;
  role: ShoreRole;
  /** 社内の肩書き（ロールとは別。同じロールでも責任の重さが違うため表示を分ける） */
  title: string;
  /** サインイン ID（デザイン正本のメール + パスワード方式） */
  email: string;
  /** PoC のデモ用パスワード。本番は Supabase Auth が保持し、アプリは平文を持たない */
  demoPassword: string;
  /** 招待済みだが未登録（S-15 のユーザー管理で「招待中」と表示する） */
  invitePending?: boolean;
}

export const SEED_SHORE_STAFF: SeedShoreStaff[] = [
  {
    id: "shore-shiraishi",
    name: "白石 千夏",
    role: "labor_manager",
    title: "労務担当",
    email: "shiraishi@shoun-kaiun.co.jp",
    demoPassword: "nautra-demo",
  },
  {
    id: "shore-taniguchi",
    name: "谷口 亮子",
    role: "labor_manager",
    title: "労務管理責任者",
    email: "taniguchi@shoun-kaiun.co.jp",
    demoPassword: "nautra-demo",
  },
  {
    id: "shore-fujii",
    name: "藤井 圭",
    role: "operations",
    title: "運航担当",
    email: "fujii@shoun-kaiun.co.jp",
    demoPassword: "nautra-demo",
  },
  {
    id: "shore-okamoto",
    name: "岡本 遥",
    role: "clerk",
    title: "経理・事務",
    email: "okamoto@shoun-kaiun.co.jp",
    demoPassword: "nautra-demo",
  },
  {
    id: "shore-yamaguchi",
    name: "山口 隆",
    role: "admin",
    title: "海務部長（管理者）",
    email: "yamaguchi@shoun-kaiun.co.jp",
    demoPassword: "nautra-demo",
  },
];

/** 承認の最終権限者（デザインのサイドバー下部に出る「労務管理責任者」） */
export const SEED_RESPONSIBLE_MANAGER = SEED_SHORE_STAFF.find(
  (s) => s.title === "労務管理責任者",
)!;
