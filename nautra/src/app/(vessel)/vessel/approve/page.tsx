"use client";

import { useMemo, useState, type ReactNode } from "react";
import { addDays, evaluateDaily, ymdLocal } from "@/domain/labor-law/evaluate";
import { effectiveRecords } from "@/domain/labor-law/intervals";
import type { DailyLaborSummary } from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";
import { CREW_MEMBERS, crewById, type CrewMember } from "@/lib/crew";
import { cn } from "@/lib/cn";
import { fmtDateLabel, fmtDateTime, fmtMinutes } from "@/lib/format";
import { CHECK_PLAIN_LABEL, describeCheck, LEVEL_PLAIN } from "@/lib/labor-plain";
import { recordApproval } from "@/lib/vessel-actions";
import { useAllRecords, useApprovals, useNowTick, useSessionCrew } from "@/lib/vessel-hooks";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";
import { resolveApproval } from "@/sync-protocol/events";
import { SurfaceCard, StatusChip, useModalProps } from "@/ui";
import { Button, CardBody, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem, Textarea, useDisclosure } from "@/ui/heroui";

import { GroupHeader } from "../_components/group-header";
import { PermissionGate } from "../_components/permission-gate";

interface DayRow {
  crew: CrewMember;
  date: string;
  summary: DailyLaborSummary;
  approval: ReturnType<typeof resolveApproval>;
}

/**
 * V-04 船内承認（船長）。日次レコードの承認・差戻し。
 * 承認者は打刻を修正できない。修正は本人への差戻しのみ（要件定義書 3.2.1）。
 * 承認イベントは追記され、同 role は後勝ち・履歴保全（基本設計書 8.3）。
 */
export default function ApprovePage() {
  const session = useSessionCrew();
  const records = useAllRecords();
  const approvals = useApprovals();
  const now = useNowTick(60_000);
  const ruleSet = DEFAULT_LABOR_RULE_SET;
  const today = ymdLocal(now);

  const remandModal = useDisclosure();
  const modalProps = useModalProps();
  const [remandRow, setRemandRow] = useState<DayRow | null>(null);
  const [remandTargetId, setRemandTargetId] = useState<string>("");
  const [remandReason, setRemandReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const result: DayRow[] = [];
    for (let offset = 0; offset >= -2; offset--) {
      const date = addDays(today, offset);
      for (const crew of CREW_MEMBERS) {
        const summary = evaluateDaily({ crewMemberId: crew.id, date, records, now, ruleSet });
        if (!summary.hasRecords) continue;
        const dayApprovals = approvals
          .filter((a) => a.crewMemberId === crew.id && a.date === date)
          .map((payload) => ({ payload }));
        result.push({ crew, date, summary, approval: resolveApproval(dayApprovals) });
      }
    }
    return result;
  }, [today, records, approvals, now, ruleSet]);

  const pendingRows = useMemo(() => rows.filter((r) => !r.approval), [rows]);
  /**
   * 「承認待ち」と「承認済み」に分けて並べる（レビュー APPR-04）。承認すると、その日の札は
   * 承認済みの群へ移る（承認イベントが追記され、useApprovals の再描画で群が変わる）。
   * 差戻した日は本人が直して再び承認されるまで「承認待ち」に残す。
   */
  const waitingRows = useMemo(() => rows.filter((r) => r.approval?.decision !== "approved"), [rows]);
  const approvedRows = useMemo(() => rows.filter((r) => r.approval?.decision === "approved"), [rows]);
  const attentionRows = useMemo(() => rows.filter((r) => r.summary.level !== "ok"), [rows]);

  async function approve(row: DayRow) {
    await recordApproval({
      crewMemberId: row.crew.id,
      date: row.date,
      decision: "approved",
      approvedBy: session!.id, // 承認者はサインイン中の本人（権限は PermissionGate で保証）
    });
  }

  function openRemand(row: DayRow) {
    setRemandRow(row);
    setRemandTargetId("");
    setRemandReason("");
    setFormError(null);
    remandModal.onOpen();
  }

  async function submitRemand() {
    if (!remandRow) return;
    if (!remandTargetId) {
      setFormError("差戻し対象の打刻を選択してください");
      return;
    }
    if (!remandReason.trim()) {
      setFormError("差戻し理由を入力してください");
      return;
    }
    await recordApproval({
      crewMemberId: remandRow.crew.id,
      date: remandRow.date,
      decision: "remanded",
      targetRecordId: remandTargetId,
      reason: remandReason.trim(),
      approvedBy: session!.id, // 承認者はサインイン中の本人（権限は PermissionGate で保証）
    });
    remandModal.onClose();
  }

  const remandCandidates = useMemo(() => {
    if (!remandRow) return [];
    return effectiveRecords(records)
      .filter(
        (r) =>
          r.crewMemberId === remandRow.crew.id &&
          ymdLocal(new Date(r.occurredAt)) === remandRow.date,
      )
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }, [remandRow, records]);

  function renderRow(row: DayRow) {
    const decided = row.approval?.decision;
    const attention = row.summary.level !== "ok";
    // 陸上（労務管理責任者）が差戻した日は、役割の優先で船長の承認が効かない（12.5）。
    // 押しても変わらないボタンを出さず、本人の修正待ちであることを示す
    const shoreRemanded = row.approval?.approverRole === "labor_manager" && decided === "remanded";
    return (
      <SurfaceCard
        key={`${row.crew.id}-${row.date}`}
        className={cn(
          "border-2",
          attention ? "border-danger" : !decided ? "border-warning" : "border-transparent",
        )}
      >
        <CardBody className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-lg font-bold">{row.crew.name}</span>
              <span className="text-sm text-foreground-600">{row.crew.position}</span>
              <span className="font-semibold">{fmtDateLabel(row.date)}</span>
            </div>
            <div className="flex items-center gap-2">
              {decided ? (
                <Chip
                  variant="flat"
                  radius="sm"
                  color={decided === "approved" ? "success" : "danger"}
                >
                  {decided === "approved" ? "✓ " : "✕ "}
                  {t.approval[decided]}（
                  {crewById(row.approval!.approvedBy)?.name ?? row.approval!.approvedBy}）
                </Chip>
              ) : (
                <Chip variant="flat" radius="sm" color="warning">
                  ⚠ {t.approval.pending}
                </Chip>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="tabular-nums text-2xl font-bold">
              {fmtMinutes(row.summary.workedMinutes)}
              <span className="ml-1 text-sm font-normal text-foreground-600">働いた時間</span>
            </span>
            <StatusChip level={row.summary.level} />
          </div>

          {/* 基準を外れた項目は理由まで書く（一目で判断できるように） */}
          {attention ? (
            <ul className="flex flex-col gap-1">
              {row.summary.checks
                .filter((c) => c.level !== "ok")
                .map((c) => (
                  <li key={c.key} className="text-pretty text-sm">
                    <span aria-hidden="true" className="mr-1">
                      {LEVEL_PLAIN[c.level].icon}
                    </span>
                    <span className="font-semibold">{CHECK_PLAIN_LABEL[c.key]}</span>:{" "}
                    {describeCheck(c)}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground-600">
              労働時間・休息はいずれも基準を満たしています。
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              color="primary"
              radius="md"
              className="min-h-12 flex-1 text-base font-bold"
              isDisabled={decided === "approved" || shoreRemanded}
              onPress={() => void approve(row)}
            >
              {decided === "approved" ? "承認済み" : shoreRemanded ? "陸上が差戻し中（本人の修正待ち）" : "承認する"}
            </Button>
            <Button
              color="danger"
              variant="bordered"
              radius="md"
              className="min-h-12 flex-1 text-base font-semibold"
              onPress={() => openRemand(row)}
            >
              差戻す（本人に直してもらう）
            </Button>
          </div>
        </CardBody>
      </SurfaceCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="02" subtitle="船内承認" />
      <PermissionGate
        permission="approve_labor"
        fallbackTitle="日次労務の承認・差戻しは船長のみが行えます"
        fallbackNote="自分の記録の確認は「02 本日の集計」、打刻の訂正は「01 打刻」の履歴・事後入力から行えます（基本設計書 11.2）。"
      >
      {/*
        何をすればよいかを最初に大きく出す（デザイン正本 V-04 の暗い帯）。
        右側には**できないこと**を並べる。承認者が打刻そのものを直せると思ったまま
        操作されるのが、この画面でいちばん困る誤解だから。
      */}
      <div className="ui-dark flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <p className="m-0 mt-1.5 text-2xl font-bold text-white">
            <span aria-hidden="true" className="mr-2">
              {pendingRows.length > 0 ? "⚠" : "✓"}
            </span>
            {pendingRows.length > 0
              ? `承認まちが ${pendingRows.length}件 あります`
              : "承認まちはありません"}
          </p>
          {attentionRows.length > 0 ? (
            <p className="m-0 mt-1.5 text-lg font-semibold text-[#F2E2DF]">
              ✕ 労働時間・休息の基準を外れている記録が {attentionRows.length}件 あります。先に確認してください。
            </p>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <SurfaceCard>
          <CardBody className="p-4">
            <p className="text-foreground-600">承認する記録はありません。</p>
          </CardBody>
        </SurfaceCard>
      ) : null}

      {rows.length > 0 ? (
        <>
          <ApprovalGroup title="承認待ち" count={waitingRows.length} empty="承認待ちはありません">
            {waitingRows.map(renderRow)}
          </ApprovalGroup>
          <ApprovalGroup title="承認済み" count={approvedRows.length} empty="まだありません">
            {approvedRows.map(renderRow)}
          </ApprovalGroup>
        </>
      ) : null}

      </PermissionGate>

      <Modal {...modalProps} isOpen={remandModal.isOpen} onOpenChange={remandModal.onOpenChange} placement="center">
        <ModalContent>
          <ModalHeader>差戻し（本人再入力の依頼）</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            {remandRow ? (
              <p className="text-sm text-foreground-600">
                {fmtDateLabel(remandRow.date)} {remandRow.crew.name} の打刻から対象を選択してください。
              </p>
            ) : null}
            <Select
              label="差戻し対象の打刻"
              selectedKeys={remandTargetId ? [remandTargetId] : []}
              onSelectionChange={(keys) => {
                const k = [...keys][0];
                setRemandTargetId(k ? String(k) : "");
              }}
            >
              {remandCandidates.map((r) => (
                <SelectItem key={r.id}>
                  {`${fmtDateTime(r.occurredAt)} ${t.workCategory[r.workCategory]} ${t.action[r.action]}`}
                </SelectItem>
              ))}
            </Select>
            <Textarea
              label="差戻し理由（本人に表示されます）"
              value={remandReason}
              onValueChange={setRemandReason}
              minRows={2}
            />
            {formError ? <p className="text-danger">✕ {formError}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={remandModal.onClose}>
              キャンセル
            </Button>
            <Button color="danger" onPress={() => void submitRemand()}>
              差戻す
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

/** 承認の群（承認待ち／承認済み）。見出しに件数を添える */
function ApprovalGroup({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="m-0 flex items-baseline gap-2 text-xl font-bold text-foreground-900">
        {title}
        <span className="font-mono text-base font-normal tabular-nums text-foreground-500">{count}</span>
      </h2>
      {count === 0 ? <p className="ui-card m-0 px-4 py-4 text-lg text-foreground-500">{empty}</p> : children}
    </section>
  );
}
