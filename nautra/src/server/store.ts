import fs from "node:fs";
import path from "node:path";
import type { TimeRecord } from "@/domain/labor-law/types";
import type { ApprovalPayload } from "@/sync-protocol/events";
import { makeSeedEvents, todayYmd } from "@/lib/seed";
import {
  applyPush,
  createEmptyStoreState,
  type ApplyPushResult,
  type StoreState,
  type StoredEvent,
} from "./apply-push";

/**
 * 陸上側イベントストア（PoC）。
 * 本番では Supabase PostgreSQL（sync_events / sync_quarantine、UNIQUE 制約による冪等）に
 * 置き換わる。PoC ではローカル JSON ファイル（.data/store.json、gitignore 済み）へ永続化する。
 * イベントは追記のみ（一次記録のイミュータブル性を保持）。
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

declare global {
  // Next.js dev のホットリロードを跨いで単一インスタンスを保つ
  // eslint-disable-next-line no-var
  var __nautraStoreState: StoreState | undefined;
}

function save(state: StoreState): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(state), "utf8");
}

function load(): StoreState {
  if (fs.existsSync(STORE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) as StoreState;
    } catch {
      // 壊れたファイルは退避して作り直す（デモ用フェイルセーフ。データは破棄しない）
      fs.renameSync(STORE_FILE, `${STORE_FILE}.corrupt-${Date.now()}`);
    }
  }
  const state = createEmptyStoreState();
  applyPush(state, "seed-shore-device", makeSeedEvents(todayYmd()), new Date());
  save(state);
  return state;
}

export function getStore(): StoreState {
  if (!globalThis.__nautraStoreState) {
    globalThis.__nautraStoreState = load();
  }
  return globalThis.__nautraStoreState;
}

export interface PushOutcome extends ApplyPushResult {
  serverVersion: number;
  serverReceivedAt: string;
}

export function pushToStore(deviceId: string, rawEvents: unknown[]): PushOutcome {
  const state = getStore();
  const now = new Date();
  const result = applyPush(state, deviceId, rawEvents, now);
  save(state);
  return { ...result, serverVersion: state.version, serverReceivedAt: now.toISOString() };
}

export function eventsSince(since: number): StoredEvent[] {
  return getStore().events.filter((e) => e.serverSeq > since);
}

export function getTimeRecords(): TimeRecord[] {
  return getStore()
    .events.filter((e) => e.event.kind === "time_record")
    .map((e) => e.event.payload as TimeRecord);
}

export interface ApprovalWithSeq {
  payload: ApprovalPayload;
  serverSeq: number;
}

export function getApprovalEvents(): ApprovalWithSeq[] {
  return getStore()
    .events.filter((e) => e.event.kind === "approval")
    .map((e) => ({ payload: e.event.payload as ApprovalPayload, serverSeq: e.serverSeq }));
}

export function getSyncStats() {
  const state = getStore();
  const last = state.events[state.events.length - 1];
  return {
    serverVersion: state.version,
    eventCount: state.events.length,
    quarantineCount: state.quarantine.length,
    lastReceivedAt: last?.serverReceivedAt ?? null,
  };
}
