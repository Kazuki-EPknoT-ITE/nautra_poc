"use client";

import Link from "next/link";
import { useMemo } from "react";
import { can } from "@/domain/authz/roles";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/format";
import { openMaintenanceIssues } from "@/lib/maintenance-status";
import { acknowledgeNotices } from "@/lib/vessel-actions";
import {
  useNotices,
  useRecords,
  useSessionCrew,
  useShiftPlans,
  useSyncBadge,
} from "@/lib/vessel-hooks";
import type { NoticePayload } from "@/sync-protocol/records";
import { Button, Card, CardBody, CardHeader, Chip, Divider } from "@/ui";

/**
 * お知らせ欄（メニュー右側）。
 *
 * 通知を機能カードの中に置くとタイトルと並んで幅を奪い、見出しが崩れる。
 * 通知はカードから外に出してここへ集約し、カードは「番号・タイトル・ボタン」だけにする。
 * 扱うのは2種類:
 * - 速報・お知らせ: 陸上が配信する notice（気象・航行警報など）
 * - あなたへの通知: 端末内のデータから導いた「対応が要るもの」（当直変更・不良・承認まち・未同期）
 * 導出はいずれも各画面と同じ関数を使い、ここで別計算しない。
 */

/** 一覧に出すお知らせの件数（続きは件数だけ示す） */
const MAX_NOTICES = 3;

interface TodoItem {
  key: string;
  icon: string;
  text: string;
  href: string;
  urgent?: boolean;
}

export function NoticePanel() {
  const session = useSessionCrew();
  const { notices, unread, ackAt } = useNotices();
  const { unread: shiftUnread } = useShiftPlans();
  const maintenance = useRecords("maintenance_record");
  const { pendingCount } = useSyncBadge();

  const todos = useMemo<TodoItem[]>(() => {
    const list: TodoItem[] = [];
    // 当直の変更は本人の分だけ（他船員の予定は本人にしか表示しない）
    const myShift = session ? shiftUnread.filter((u) => u.crewMemberId === session.id) : [];
    if (myShift.length > 0) {
      list.push({
        key: "shift",
        icon: "✎",
        text: `当直の予定が ${myShift.length}件 変わりました`,
        href: "/vessel/shift",
      });
    }
    const defects = openMaintenanceIssues(maintenance).filter((m) => m.condition === "defect");
    if (defects.length > 0) {
      list.push({
        key: "defect",
        icon: "⚠",
        text: `機器の不良が ${defects.length}件 あります`,
        href: "/vessel/maintenance",
        urgent: true,
      });
    }
    if (pendingCount > 0) {
      list.push({
        key: "pending",
        icon: "↑",
        text: `未送信の記録が ${pendingCount}件 あります`,
        href: "/vessel/sync",
      });
    }
    if (session && can(session.role, "approve_labor")) {
      list.push({ key: "approve", icon: "☑", text: "船内承認を確認する", href: "/vessel/approve" });
    }
    return list;
  }, [session, shiftUnread, maintenance, pendingCount]);

  return (
    <aside aria-label="お知らせ" className="flex flex-col gap-4">
      <Card shadow="none" className="glass-tile">
        <CardHeader className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
          <span className="font-bold">速報・お知らせ</span>
          {unread.length > 0 ? (
            <Button
              size="sm"
              variant="bordered"
              className="min-h-9 border-[var(--glass-border-strong)]"
              onPress={() => void acknowledgeNotices()}
            >
              確認しました
            </Button>
          ) : null}
        </CardHeader>
        <Divider />
        <CardBody className="flex flex-col gap-2 px-4 py-3">
          {notices.length === 0 ? (
            <p className="text-sm text-foreground-600">
              新しいお知らせはありません{ackAt ? `（最終確認 ${fmtDateTime(ackAt)}）` : ""}
            </p>
          ) : (
            <>
              {/* 直近の数件だけ出す（下の「あなたへの通知」を押し下げない） */}
              {notices.slice(0, MAX_NOTICES).map((n) => (
                <NoticeRow key={n.id} notice={n} isUnread={unread.some((u) => u.id === n.id)} />
              ))}
              {notices.length > MAX_NOTICES ? (
                <p className="text-xs text-foreground-600">
                  ほか {notices.length - MAX_NOTICES}件のお知らせがあります
                </p>
              ) : null}
            </>
          )}
        </CardBody>
      </Card>

      <Card shadow="none" className="glass-tile">
        <CardHeader className="px-4 pb-2 pt-4 font-bold">あなたへの通知</CardHeader>
        <Divider />
        <CardBody className="flex flex-col gap-2 px-4 py-3">
          {todos.length === 0 ? (
            <p className="text-sm text-foreground-600">対応が必要なものはありません。</p>
          ) : (
            todos.map((td) => (
              <Link
                key={td.key}
                href={td.href}
                className="glass-inset flex items-center gap-2 p-3 text-left hover:opacity-80"
              >
                <span aria-hidden="true" className={cn("text-lg", td.urgent && "text-danger")}>
                  {td.icon}
                </span>
                <span className={cn("text-sm", td.urgent && "font-semibold")}>{td.text}</span>
                <span aria-hidden="true" className="ml-auto text-foreground-600">
                  →
                </span>
              </Link>
            ))
          )}
        </CardBody>
      </Card>
    </aside>
  );
}

function NoticeRow({ notice, isUnread }: { notice: NoticePayload; isUnread: boolean }) {
  const urgent = notice.level === "urgent";
  return (
    <article
      className={cn("glass-inset flex flex-col gap-1 p-3", urgent && "border border-danger")}
      aria-label={`${urgent ? "速報" : "お知らせ"}: ${notice.title}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip size="sm" variant="flat" color={urgent ? "danger" : "default"} radius="sm">
          {urgent ? "‼ 速報" : "お知らせ"}
        </Chip>
        {isUnread ? (
          <Chip size="sm" variant="flat" color="warning" radius="sm">
            未読
          </Chip>
        ) : null}
      </div>
      <p className={cn("text-pretty text-sm font-bold leading-snug", urgent && "text-base")}>
        {notice.title}
      </p>
      {notice.body ? <p className="text-pretty text-sm text-foreground-600">{notice.body}</p> : null}
      <p className="text-xs text-foreground-600">{fmtDateTime(notice.publishedAt)} 陸上より</p>
    </article>
  );
}
