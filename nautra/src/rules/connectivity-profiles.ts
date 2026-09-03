/**
 * 接続可否4類型ごとの運用構成（要件定義書 10.1 / 基本設計書 2.5「接続4類型への対応構成」）。
 *
 *   「陸—船・船内の接続可否4類型（常時接続可 / 陸船間のみ可 / 出航前後のみ可 / 全て不可）
 *    ごとに運用構成を選択できること」
 *
 * 何が変わるか:
 * - **同期の間隔**と**即時通知（SSE）を使うか**。回線が細い・従量課金の環境で
 *   1分おきに Pull を投げると通信量と電池を無駄にする。
 * - **1回の Push で送るイベント数**（`batchSize`）。細い回線では小さく刻んで
 *   途中で切れても再開できるようにする（8.1 再開可能・冪等）。
 * - **手動同期を前面に出すか**。出航前後しかつながらない船では、
 *   「いま同期する」を利用者が意識的に押す運用になる。
 *
 * 変えないもの:
 * - 記録は常にローカル（IndexedDB）へ先に確定する。どの類型でも打刻・記録は成立する。
 * - 冪等キー・カーソル方式・競合ポリシーは共通（構成で同期の正しさを変えない）。
 */

export type ConnectivityProfileId = "always" | "shore_only" | "port_only" | "offline";

export interface ConnectivityProfile {
  id: ConnectivityProfileId;
  label: string;
  /** どういう船・航路が該当するか */
  description: string;
  /** 定期同期の間隔（ミリ秒）。0 = 定期同期を行わない（手動のみ） */
  syncIntervalMs: number;
  /** 版変更の即時通知（SSE / 本番は Supabase Realtime）を張るか */
  useLiveStream: boolean;
  /** 1回の Push で送るイベント数の上限 */
  batchSize: number;
  /** 記録直後に同期を試みるか（false なら溜めておく） */
  syncOnRecord: boolean;
  /** 画面に「手動同期」を目立たせるか */
  emphasizeManualSync: boolean;
  /** 利用者向けの運用の説明（画面にそのまま出す） */
  operationNote: string;
}

export const CONNECTIVITY_PROFILES: Record<ConnectivityProfileId, ConnectivityProfile> = {
  always: {
    id: "always",
    label: "常時つながる",
    description: "船内 Wi-Fi と陸船間の回線が常時使える（衛星通信・沿岸の携帯回線など）",
    syncIntervalMs: 60_000,
    useLiveStream: true,
    batchSize: 500,
    syncOnRecord: true,
    emphasizeManualSync: false,
    operationNote:
      "記録するとすぐ陸上へ送られます。陸上からの当直変更・お知らせも、画面を開いたままで反映されます。",
  },
  shore_only: {
    id: "shore_only",
    label: "陸船間だけつながる",
    description: "船内 LAN は無いが、船と陸上の間は回線がある（船橋の端末だけがつながる等）",
    syncIntervalMs: 300_000,
    useLiveStream: false,
    batchSize: 200,
    syncOnRecord: true,
    emphasizeManualSync: false,
    operationNote:
      "5分ごとに陸上とやりとりします。即時の通知は使わないため、陸上の変更は最大5分ほど遅れて届きます。",
  },
  port_only: {
    id: "port_only",
    label: "出航前後だけつながる",
    description: "航海中は圏外で、着岸中・出航前後にだけ回線が使える",
    syncIntervalMs: 900_000,
    useLiveStream: false,
    batchSize: 100,
    syncOnRecord: false,
    emphasizeManualSync: true,
    operationNote:
      "航海中の記録は端末に貯まります。港に着いて回線が使えるようになったら「いま同期する」を押してください。未送信の件数は同期の画面で確認できます。",
  },
  offline: {
    id: "offline",
    label: "つながらない",
    description: "船内・陸船間ともに回線が無い。記録の受け渡しは下船時に行う",
    syncIntervalMs: 0,
    useLiveStream: false,
    batchSize: 100,
    syncOnRecord: false,
    emphasizeManualSync: true,
    operationNote:
      "記録はすべて端末の中に貯まります。回線のある場所に持ち出したときにまとめて送ってください。記録は端末に残り続けるので、送るまで失われません。",
  },
};

export const DEFAULT_CONNECTIVITY_PROFILE: ConnectivityProfileId = "always";

export const CONNECTIVITY_PROFILE_LIST: ConnectivityProfile[] = [
  CONNECTIVITY_PROFILES.always,
  CONNECTIVITY_PROFILES.shore_only,
  CONNECTIVITY_PROFILES.port_only,
  CONNECTIVITY_PROFILES.offline,
];

export function connectivityProfile(id: string | undefined | null): ConnectivityProfile {
  return (
    CONNECTIVITY_PROFILES[(id ?? "") as ConnectivityProfileId] ??
    CONNECTIVITY_PROFILES[DEFAULT_CONNECTIVITY_PROFILE]
  );
}
