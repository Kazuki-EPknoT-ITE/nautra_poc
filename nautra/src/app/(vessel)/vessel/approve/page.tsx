"use client";

import { useMemo, useState } from "react";
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
import {
  Button,
  CardBody,
  Chip,
  GlassCard,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  StatusChip,
  Textarea,
  useDisclosure,
  useGlassModalProps,
} from "@/ui";

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
  const glassModal = useGlassModalProps();
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

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="02" subtitle="船内承認" />
      <PermissionGate
        permission="approve_labor"
        fallbackTitle="日次労務の承認・差戻しは船長のみが行えます"
        fallbackNote="自分の記録の確認は「02 本日の集計」、打刻の訂正は「01 打刻」の履歴・事後入力から行えます（基本設計書 11.2）。"
      >
      <p className="text-sm text-foreground-600">承認者: {session?.name}（{session ? t.role[session.role] : ""}）</p>

      {/* 何をすればよいかを最初に大きく出す */}
      <GlassCard blurred className={pendingRows.length > 0 ? "border-2 border-warning" : undefined}>
        <CardBody className="flex flex-col gap-2 p-5">
          <p className="text-balance text-2xl font-bold">
            <span aria-hidden="true" className="mr-2">
              {pendingRows.length > 0 ? "⚠" : "✓"}
            </span>
            {pendingRows.length > 0
              ? `承認まちが ${pendingRows.length}件 あります`
              : "承認まちはありません"}
          </p>
          <p className="text-pretty text-foreground-600">
            内容を確認して「承認する」を押します。打刻に誤りがあるときは「差戻す」を押すと、
            本人が正しい時刻で入れ直します（承認者は打刻を直接修正できません）。
          </p>
          {attentionRows.length > 0 ? (
            <p className="text-pretty font-semibold text-danger">
              ✕ 労働時間・休息の基準を外れている記録が {attentionRows.length}件 あります。先に確認してください。
            </p>
          ) : null}
        </CardBody>
      </GlassCard>

      <div className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <GlassCard>
            <CardBody className="p-4">
              <p className="text-foreground-600">直近3日間に承認対象の記録がありません。</p>
            </CardBody>
          </GlassCard>
        ) : null}
        {rows.map((row) => {
          const decided = row.approval?.decision;
          const attention = row.summary.level !== "ok";
          return (
            <GlassCard
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
                    isDisabled={decided === "approved"}
                    onPress={() => void approve(row)}
                  >
                    {decided === "approved" ? "承認済み" : "承認する"}
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
            </GlassCard>
          );
        })}
      </div>

      </PermissionGate>

      <Modal {...glassModal} isOpen={remandModal.isOpen} onOpenChange={remandModal.onOpenChange} placement="center">
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
