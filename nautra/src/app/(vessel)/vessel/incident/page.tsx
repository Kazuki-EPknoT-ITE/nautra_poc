"use client";

import { useMemo, useState } from "react";
import { t } from "@/i18n/ja";
import { personName } from "@/lib/crew";
import { fmtDateTime, fromLocalInputValue, toLocalInputValue } from "@/lib/format";
import { useLocale } from "@/lib/use-locale";
import { appendRecord, newRecordBase } from "@/lib/vessel-actions";
import type { VesselRecordRow } from "@/lib/vessel-db";
import { useRecords, useSessionCrew } from "@/lib/vessel-hooks";
import { INCIDENT_KINDS, latestBySupersedes, type IncidentKind } from "@/sync-protocol/records";
import {
  Button,
  Card,
  CardBody,
  Checkbox,
  Chip,
  SurfaceCard,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Textarea,
  useDisclosure,
  useModalProps,
} from "@/ui";
import { GroupHeader } from "../_components/group-header";
import { RecordTile } from "../_components/record-tile";

/**
 * 事故・インシデント報告（要件定義書 3.5.2）。
 *
 * - 種別は `INCIDENT_KINDS`（海難事故 / ヒヤリハット / 死傷病 / 設備損傷 / 油濁・排出 /
 *   コンテナ海中転落 / その他）。表示名は i18n（`t.incidentKind`）に持つ
 * - **ヒヤリハットは標題と状況だけで送れる**。報告の心理的コストを下げるため、
 *   任意項目は折りたたみに隠し、「報告した人を責めない」ことを画面に明記する
 * - コンテナ海中転落は**付近船舶等への通報**を確認する（法令上の通報義務。3.5.2）
 * - 記録は追記型。訂正は `supersedesId` 付きの新しい報告として送る（一次記録を書き換えない）
 * - このエンティティは origin が `both` のため、陸上が追記した原因分析・再発防止策が
 *   Pull で届く。履歴にはそれも表示する
 */

type IncidentRow = VesselRecordRow<"incident_report">;

/** ローカル行では業務上の区分が `payloadKind` に退避される（vessel-db の toRecordRow） */
function kindOf(r: IncidentRow): IncidentKind {
  const k = r.payloadKind;
  return (INCIDENT_KINDS as readonly string[]).includes(k ?? "") ? (k as IncidentKind) : "other";
}

export default function IncidentPage() {
  const session = useSessionCrew();
  const { tr } = useLocale();
  const reports = useRecords("incident_report");
  const modalProps = useModalProps();
  const [done, setDone] = useState<string | null>(null);

  const modal = useDisclosure();
  const [kind, setKind] = useState<IncidentKind>("near_miss");
  const [supersedes, setSupersedes] = useState<IncidentRow | null>(null);
  const [title, setTitle] = useState("");
  const [occurredAt, setOccurredAt] = useState(toLocalInputValue(new Date()));
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [injured, setInjured] = useState("");
  const [damage, setDamage] = useState("");
  const [cause, setCause] = useState("");
  const [preventiveAction, setPreventiveAction] = useState("");
  const [notifiedNearbyShips, setNotifiedNearbyShips] = useState(false);
  const [reportedToAuthority, setReportedToAuthority] = useState(false);
  const [authorityReportedOn, setAuthorityReportedOn] = useState("");
  const [error, setError] = useState<string | null>(null);

  /** ヒヤリハットは最小限（標題＋状況）で送れるようにする */
  const isMinimal = kind === "near_miss";

  function reset(next: IncidentKind) {
    setKind(next);
    setSupersedes(null);
    setTitle("");
    setOccurredAt(toLocalInputValue(new Date()));
    setLocation("");
    setDescription("");
    setInjured("");
    setDamage("");
    setCause("");
    setPreventiveAction("");
    setNotifiedNearbyShips(false);
    setReportedToAuthority(false);
    setAuthorityReportedOn("");
    setError(null);
  }

  function openNew(next: IncidentKind) {
    reset(next);
    modal.onOpen();
  }

  /** 訂正は「直した内容の新しい報告」を supersedesId 付きで送る（元の報告は保持される） */
  function openCorrection(r: IncidentRow) {
    reset(kindOf(r));
    setSupersedes(r);
    setTitle(r.title);
    setOccurredAt(toLocalInputValue(new Date(r.occurredAt)));
    setLocation(r.location ?? "");
    setDescription(r.description);
    setInjured(r.injured ?? "");
    setDamage(r.damage ?? "");
    setCause(r.cause ?? "");
    setPreventiveAction(r.preventiveAction ?? "");
    setNotifiedNearbyShips(Boolean(r.notifiedNearbyShips));
    setReportedToAuthority(Boolean(r.reportedToAuthority));
    setAuthorityReportedOn(r.authorityReportedOn ?? "");
    modal.onOpen();
  }

  async function submit() {
    setError(null);
    try {
      if (!session) throw new Error("サインインが必要です");
      if (!title.trim()) throw new Error("標題を入力してください");
      if (!description.trim()) throw new Error("状況を入力してください");
      const at = fromLocalInputValue(occurredAt);
      if (!at) throw new Error("発生日時を入力してください");
      const base = await newRecordBase(session.id, at, supersedes?.id);
      await appendRecord("incident_report", {
        ...base,
        kind,
        title: title.trim(),
        location: location.trim() || undefined,
        description: description.trim(),
        injured: injured.trim() || undefined,
        damage: damage.trim() || undefined,
        cause: cause.trim() || undefined,
        preventiveAction: preventiveAction.trim() || undefined,
        notifiedNearbyShips: kind === "container_loss" ? notifiedNearbyShips : undefined,
        // 通報は「したか」だけでなく**いつしたか**を残す（3.5.2。事後の検証で時間が問われる）
        notifiedNearbyShipsAt:
          kind === "container_loss" && notifiedNearbyShips
            ? (supersedes?.notifiedNearbyShipsAt ?? new Date().toISOString())
            : undefined,
        reportedToAuthority,
        authorityReportedOn: reportedToAuthority ? authorityReportedOn || undefined : undefined,
        /**
         * 訂正では**陸上が進めた対応状況を引き継ぐ**。
         * 船内が本文を直すたびに "open" へ戻すと、陸上の原因分析（investigating / closed）が
         * 巻き戻り、対応済みの事故が未対応として再浮上してしまう。
         */
        status: supersedes?.status ?? "open",
      });
      setDone(
        supersedes
          ? `${tr("incidentKind", kind)} の報告を直しました（元の報告は訂正済として残ります）`
          : `${tr("incidentKind", kind)} を報告しました。ありがとうございます`,
      );
      modal.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // 有効な報告（訂正で置き換えられたものを除く）を新しい順に
  const effective = useMemo(() => latestBySupersedes(reports), [reports]);

  if (!session) return null;

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="07" subtitle="事故・ヒヤリ" />

      <SurfaceCard>
        <CardBody className="flex flex-col gap-2 p-5">
          <p className="text-pretty text-lg font-bold">報告した人を責めません</p>
          <p className="text-pretty text-foreground-600">
            ヒヤリハットは「危なかったこと」を共有するための報告です。報告したことで
            不利益な扱いを受けることはありません。
            <strong>標題と状況だけ</strong>で送れます。原因や対策は、あとから陸上と一緒に埋めます。
          </p>
        </CardBody>
      </SurfaceCard>

      <section aria-label="報告の種類" className="flex flex-col gap-2">
        <h2 className="text-base font-bold text-foreground-600">どれを報告しますか</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {INCIDENT_KINDS.map((k) => (
            <RecordTile
              key={k}
              label={tr("incidentKind", k)}
              sublabel={k === "near_miss" ? "標題と状況だけで送れます" : undefined}
              onPress={() => openNew(k)}
            />
          ))}
        </div>
      </section>

      {done ? (
        <Chip variant="flat" radius="sm" className="h-auto whitespace-normal py-1">
          ✓ {done}
        </Chip>
      ) : null}

      <section aria-label="報告の履歴" className="flex flex-col gap-2">
        <h2 className="text-base font-bold text-foreground-600">この船の報告（新しい順）</h2>
        {effective.length === 0 ? (
          <Card shadow="none" className="ui-card">
            <CardBody>
              <p className="text-foreground-600">報告はありません。</p>
            </CardBody>
          </Card>
        ) : null}
        {effective.map((r) => (
          <Card key={r.id} shadow="none" className="ui-card">
            <CardBody className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums font-bold">{fmtDateTime(r.occurredAt)}</span>
                <Chip size="sm" variant="flat" radius="sm">
                  {tr("incidentKind", kindOf(r))}
                </Chip>
                <span className="font-semibold">{r.title}</span>
                <Chip
                  size="sm"
                  variant="flat"
                  radius="sm"
                  color={r.status === "closed" ? "success" : "default"}
                >
                  {r.status === "closed" ? "✓ " : ""}
                  {tr("incidentStatus", r.status)}
                </Chip>
                <span className="ml-auto text-sm text-foreground-600">
                  報告者 {personName(r.recordedBy)}
                </span>
              </div>
              {r.location ? (
                <p className="text-sm text-foreground-600">場所: {r.location}</p>
              ) : null}
              <p className="text-pretty">{r.description}</p>
              {r.injured ? <p className="text-pretty text-sm">負傷者: {r.injured}</p> : null}
              {r.damage ? <p className="text-pretty text-sm">被害: {r.damage}</p> : null}

              {/* 陸上が追記した原因分析・再発防止策（origin=both のため Pull で届く） */}
              {r.cause || r.preventiveAction ? (
                <div className="ui-inset flex flex-col gap-1 p-3">
                  {r.cause ? <p className="text-pretty text-sm">原因: {r.cause}</p> : null}
                  {r.preventiveAction ? (
                    <p className="text-pretty text-sm">再発防止: {r.preventiveAction}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {kindOf(r) === "container_loss" ? (
                  <Chip
                    size="sm"
                    variant="flat"
                    radius="sm"
                    color={r.notifiedNearbyShips ? "success" : "warning"}
                  >
                    {r.notifiedNearbyShips ? "✓ 付近船舶等へ通報済" : "⚠ 付近船舶等へ未通報"}
                  </Chip>
                ) : null}
                {r.reportedToAuthority ? (
                  <Chip size="sm" variant="flat" radius="sm">
                    ✓ 行政機関へ報告済
                    {r.authorityReportedOn ? `（${r.authorityReportedOn}）` : ""}
                  </Chip>
                ) : null}
                <Button
                  size="sm"
                  variant="bordered"
                  radius="md"
                  className="ml-auto min-h-11 border-[var(--ui-hairline-strong)] text-foreground"
                  onPress={() => openCorrection(r)}
                >
                  内容を直す
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </section>

      <Modal
        {...modalProps}
        isOpen={modal.isOpen}
        onOpenChange={modal.onOpenChange}
        placement="center"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader>
            {t.incidentKind[kind]} の{supersedes ? "訂正" : "報告"}
          </ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            {supersedes ? (
              <p className="text-sm text-foreground-600">
                直した内容を新しい報告として送ります。元の報告は「訂正済」として残ります
                （記録は書き換えません）。
              </p>
            ) : null}

            <Input label="標題（必須）" value={title} onValueChange={setTitle} />
            <Textarea
              label="状況（必須）"
              placeholder="何が起きたか、そのとき何をしていたかを書いてください"
              value={description}
              onValueChange={setDescription}
              minRows={4}
            />
            <Input
              type="datetime-local"
              label="発生日時"
              value={occurredAt}
              max={toLocalInputValue(new Date())}
              onValueChange={setOccurredAt}
            />

            {/* コンテナ海中転落は付近船舶等への通報義務がある（3.5.2） */}
            {kind === "container_loss" ? (
              <div className="ui-inset flex flex-col gap-2 p-3">
                <Checkbox
                  size="lg"
                  isSelected={notifiedNearbyShips}
                  onValueChange={setNotifiedNearbyShips}
                >
                  付近船舶等へ通報した
                </Checkbox>
                <p className="text-pretty text-sm text-foreground-600">
                  コンテナを海に落としたときは、付近を航行する船へ知らせる義務があります
                  （航行の安全にかかわるため、報告書の作成より先に行ってください）。
                </p>
              </div>
            ) : null}

            {/* ヒヤリハットは任意項目を隠し、標題と状況だけで送れるようにする */}
            <details className="ui-inset p-3" open={!isMinimal}>
              <summary className="cursor-pointer text-base font-semibold">
                くわしく書く（書かなくても送れます）
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                <Input label="場所" value={location} onValueChange={setLocation} />
                <Input label="負傷者・被害を受けた人" value={injured} onValueChange={setInjured} />
                <Input label="設備・貨物の被害" value={damage} onValueChange={setDamage} />
                <Textarea label="原因" value={cause} onValueChange={setCause} minRows={2} />
                <Textarea
                  label="再発防止策"
                  value={preventiveAction}
                  onValueChange={setPreventiveAction}
                  minRows={2}
                />
                <Checkbox isSelected={reportedToAuthority} onValueChange={setReportedToAuthority}>
                  行政機関へ報告した（海難等の報告・死傷病報告）
                </Checkbox>
                {reportedToAuthority ? (
                  <Input
                    type="date"
                    label="報告した日"
                    value={authorityReportedOn}
                    onValueChange={setAuthorityReportedOn}
                  />
                ) : null}
              </div>
            </details>

            <p className="text-sm text-foreground-600">報告者: {session.name}</p>
            {error ? <p className="text-danger">✕ {error}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={modal.onClose}>
              キャンセル
            </Button>
            <Button color="primary" onPress={() => void submit()}>
              {supersedes ? "訂正を送る" : "報告する"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
