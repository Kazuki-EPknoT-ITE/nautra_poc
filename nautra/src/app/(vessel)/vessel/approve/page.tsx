"use client";

import { useMemo, useState } from "react";
import { addDays, evaluateDaily, ymdLocal } from "@/domain/labor-law/evaluate";
import { effectiveRecords } from "@/domain/labor-law/intervals";
import type { DailyLaborSummary } from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";
import { CREW_MEMBERS, crewById, type CrewMember } from "@/lib/crew";
import { fmtDateLabel, fmtDateTime, fmtMinutes } from "@/lib/format";
import { recordApproval } from "@/lib/vessel-actions";
import { useAllRecords, useApprovals, useNowTick } from "@/lib/vessel-hooks";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";
import { resolveApproval } from "@/sync-protocol/events";
import {
  Button,
  Card,
  CardBody,
  Chip,
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
} from "@/ui";

const CAPTAIN = CREW_MEMBERS.find((c) => c.role === "captain")!;

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
  const records = useAllRecords();
  const approvals = useApprovals();
  const now = useNowTick(60_000);
  const ruleSet = DEFAULT_LABOR_RULE_SET;
  const today = ymdLocal(now);

  const remandModal = useDisclosure();
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

  async function approve(row: DayRow) {
    await recordApproval({
      crewMemberId: row.crew.id,
      date: row.date,
      decision: "approved",
      approvedBy: CAPTAIN.id,
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
      approvedBy: CAPTAIN.id,
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
      <h1 className="text-xl font-bold">
        <span className="mr-2 text-foreground-400">02</span>労務管理記録簿 ─ 船内承認（{CAPTAIN.name} {CAPTAIN.position}）
      </h1>
      <p className="text-sm text-foreground-500">
        承認者は打刻を修正できません。誤りがある場合は本人へ差戻し、本人が再入力します。
      </p>

      <div className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <Card shadow="none" className="bg-content1">
            <CardBody>
              <p className="text-foreground-500">直近3日間に承認対象の記録がありません。</p>
            </CardBody>
          </Card>
        ) : null}
        {rows.map((row) => (
          <Card key={`${row.crew.id}-${row.date}`} shadow="none" className="bg-content1">
            <CardBody className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{fmtDateLabel(row.date)}</span>
                  <span>{row.crew.name}（{row.crew.position}）</span>
                  <span className="tabular-nums text-foreground-500">
                    労働 {fmtMinutes(row.summary.workedMinutes)}
                  </span>
                  <StatusChip level={row.summary.level} size="sm" />
                </div>
                <div className="flex items-center gap-2">
                  {row.approval ? (
                    <Chip
                      size="sm"
                      variant="flat"
                      radius="sm"
                      color={row.approval.decision === "approved" ? "success" : "danger"}
                    >
                      {row.approval.decision === "approved" ? "✓ " : "✕ "}
                      {t.approval[row.approval.decision]}（
                      {crewById(row.approval.approvedBy)?.name ?? row.approval.approvedBy}）
                    </Chip>
                  ) : (
                    <Chip size="sm" variant="flat" radius="sm" color="warning">
                      ⚠ {t.approval.pending}
                    </Chip>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  color="primary"
                  className="min-h-10"
                  isDisabled={row.approval?.decision === "approved"}
                  onPress={() => void approve(row)}
                >
                  承認する
                </Button>
                <Button
                  size="sm"
                  color="danger"
                  variant="bordered"
                  className="min-h-10"
                  onPress={() => openRemand(row)}
                >
                  差戻す
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Modal isOpen={remandModal.isOpen} onOpenChange={remandModal.onOpenChange} placement="center">
        <ModalContent>
          <ModalHeader>差戻し（本人再入力の依頼）</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            {remandRow ? (
              <p className="text-sm text-foreground-500">
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
