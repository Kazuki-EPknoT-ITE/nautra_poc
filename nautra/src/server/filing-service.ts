import {
  checkFilingRequirements,
  type FilingCheckResult,
  type FilingCheckTarget,
} from "@/domain/filing/requirements";
import { DEFAULT_CREDENTIAL_RULE_SET } from "@/rules/credential-rules";
import { needsPracticalTraining } from "@/server/manning-service";
import {
  COMPANY_SCOPE_ID,
  credentialsOf,
  crewMasterOf,
  crewNameOf,
  effective,
  listCrewMasters,
  listVessels,
  publishMaster,
  todayLocal,
  vesselMasterOf,
  vesselNameOf,
  writeAuditLog,
} from "@/server/master-service";
import type {
  CrewMasterPayload,
  FilingMethod,
  FilingPayload,
  FilingType,
  GeneratedDocumentPayload,
} from "@/sync-protocol/records";

/**
 * S-07 届出ウィザード（要件定義書 3.8.3 実装機能①〜⑦ / 3.8.5 / 4.3 / 6.3 / 9章）。
 *
 * 届出は1件の `filing` レコードが状態を進めながら育つ（draft → checked → documents_ready →
 * submitted）。**更新は必ず supersedesId 付きの新規レコード**で、前の版は物理保持する（12.3）。
 *
 * 添付要件の判定は `domain/filing/requirements.ts` の純関数だけが行う。ここは
 * 「誰の・どの証書を渡すか」を集める組み立て層に徹し、合否のルールを持たない。
 *
 * 書類は生成時点のマスタ値を `snapshot` に焼き込む（12.3「提出物は以後マスタが更新されても
 * 書き換えない」）。画面は snapshot だけを見て印刷用に整形する。
 */

/* ═══════════════ 3.9 連動: 実技講習が要る船員か ═══════════════ */

/**
 * 実技講習（登録実技講習機関での生存・消火）の対象船員か。
 *
 * 判定そのものは `server/manning-service.ts` の `needsPracticalTraining` が唯一の情報源。
 * 配乗判定（S-05）・届出の添付要件（S-07）・訓練管理（S-09）が同じ規則を使う必要があるため、
 * ここでは再輸出するだけで、判定を書き写さない。
 */
export const practicalTrainingRequiredFor = needsPracticalTraining;

/* ═══════════════ 一覧・チェック結果の組み立て ═══════════════ */

export interface FilingTargetView {
  crewMemberId: string;
  crewName: string;
  targetVesselId: string;
  vesselName: string;
  duty?: string;
  effectiveOn: string;
}

export interface FilingRow {
  filing: FilingPayload;
  targets: FilingTargetView[];
  /** 添付要件チェックの結果（導出値。都度算出する） */
  check: FilingCheckResult;
  documents: GeneratedDocumentPayload[];
}

function targetsOf(filing: FilingPayload): FilingTargetView[] {
  return filing.targets.map((t) => ({
    crewMemberId: t.crewMemberId,
    crewName: crewNameOf(t.crewMemberId),
    targetVesselId: t.targetVesselId,
    vesselName: vesselNameOf(t.targetVesselId),
    duty: t.duty,
    effectiveOn: t.effectiveOn,
  }));
}

/** 添付要件チェッカー（3.8.3⑥）を1件の届出に対して走らせる */
export function checkFiling(filing: FilingPayload, now = new Date()): FilingCheckResult {
  const today = todayLocal(now);
  const targets: FilingCheckTarget[] = filing.targets.map((t) => {
    const master = crewMasterOf(t.crewMemberId);
    return {
      crewMemberId: t.crewMemberId,
      crewName: crewNameOf(t.crewMemberId),
      effectiveOn: t.effectiveOn,
      master,
      credentials: credentialsOf("crew", t.crewMemberId),
      practicalTrainingRequired: practicalTrainingRequiredFor(master),
    };
  });
  return checkFilingRequirements({
    filingType: filing.filingType,
    targets,
    today,
    ruleSet: DEFAULT_CREDENTIAL_RULE_SET,
  });
}

/** 届出の一覧（新しい順）。各件に添付要件チェックの結果と生成済み書類を添える */
export function listFilings(now = new Date()): FilingRow[] {
  const docs = effective("generated_document");
  return [...effective("filing")]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .map((filing) => ({
      filing,
      targets: targetsOf(filing),
      check: checkFiling(filing, now),
      documents: docs.filter((d) => d.filingId === filing.id),
    }));
}

export function filingRowOf(filingId: string, now = new Date()): FilingRow | undefined {
  const filing = effective("filing").find((f) => f.id === filingId);
  if (!filing) return undefined;
  return {
    filing,
    targets: targetsOf(filing),
    check: checkFiling(filing, now),
    documents: effective("generated_document").filter((d) => d.filingId === filing.id),
  };
}

/* ═══════════════ ウィザード 手順② 対象の候補 ═══════════════ */

export interface FilingCandidate {
  /** 候補の識別子（船員＋船＋日付） */
  key: string;
  crewMemberId: string;
  crewName: string;
  targetVesselId: string;
  vesselName: string;
  duty?: string;
  effectiveOn: string;
  eventType: "on" | "off";
  /** すでに届出に載っているか（二重登録を避けるための表示） */
  alreadyFiled: boolean;
  blockNoteAtPlanning?: string;
}

/**
 * 未提出の乗下船予定から届出の候補を引く（3.8.3② 複数船員・複数船舶の一括登録）。
 * 「配乗計画で決めた予定がそのまま届出の対象になる」流れ（4.3 ①→②）を画面で再現する。
 */
export function listFilingCandidates(): FilingCandidate[] {
  const filed = new Set<string>();
  for (const f of effective("filing")) {
    if (f.status === "submitted" || f.status === "accepted") {
      for (const t of f.targets) filed.add(`${t.crewMemberId}|${t.targetVesselId}|${t.effectiveOn}`);
    }
  }
  return effective("embarkation")
    .filter((e) => e.status === "planned")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      key: `${e.crewMemberId}|${e.targetVesselId}|${e.date}`,
      crewMemberId: e.crewMemberId,
      crewName: crewNameOf(e.crewMemberId),
      targetVesselId: e.targetVesselId,
      vesselName: vesselNameOf(e.targetVesselId),
      duty: e.duty,
      effectiveOn: e.date,
      eventType: e.eventType,
      alreadyFiled: filed.has(`${e.crewMemberId}|${e.targetVesselId}|${e.date}`),
      blockNoteAtPlanning: e.blockNoteAtPlanning,
    }));
}

/** 手入力で対象を足すための素材（船員・船舶の一覧） */
export function filingFormOptions() {
  return {
    crew: listCrewMasters().map((c) => ({
      id: c.crewMemberId,
      name: c.name,
      position: c.position ?? "",
    })),
    vessels: listVessels(),
  };
}

/* ═══════════════ ステップ１・２: 下書きの作成 ═══════════════ */

export interface CreateFilingInput {
  filingType: FilingType;
  method: FilingMethod;
  targets: { crewMemberId: string; targetVesselId: string; duty?: string; effectiveOn: string }[];
  actor?: string;
  now?: Date;
}

export function createFilingDraft(input: CreateFilingInput): FilingPayload {
  const now = input.now ?? new Date();
  if (input.targets.length === 0) throw new Error("届出の対象を1件以上選んでください");
  for (const t of input.targets) {
    if (!t.crewMemberId || !t.targetVesselId) throw new Error("船員と船を選んでください");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.effectiveOn)) throw new Error("効力発生日を入力してください");
  }

  const filing = publishMaster(
    "filing",
    {
      filingType: input.filingType,
      method: input.method,
      targets: input.targets.map((t) => ({
        crewMemberId: t.crewMemberId,
        targetVesselId: t.targetVesselId,
        duty: t.duty?.trim() || undefined,
        effectiveOn: t.effectiveOn,
      })),
      status: "draft",
    },
    { vesselId: COMPANY_SCOPE_ID, actor: input.actor, now },
  );

  writeAuditLog({
    action: "create",
    entityKind: "filing",
    entityId: filing.id,
    after: `${input.filingType} / 対象 ${input.targets.length}名`,
    actor: input.actor,
    summary: "届出の下書きを作成",
    now,
  });
  return filing;
}

/* ═══════════════ ステップ３: 添付要件チェックの記録 ═══════════════ */

export function recordFilingCheck(
  filingId: string,
  actor?: string,
  now = new Date(),
): { filing: FilingPayload; check: FilingCheckResult } {
  const current = effective("filing").find((f) => f.id === filingId);
  if (!current) throw new Error("この届出は見つかりません（画面を開き直してください）");
  const check = checkFiling(current, now);

  const filing = publishMaster(
    "filing",
    {
      ...stripBase(current),
      status: "checked",
      checkedAt: now.toISOString(),
    },
    { vesselId: COMPANY_SCOPE_ID, supersedesId: current.id, actor, now },
  );

  writeAuditLog({
    action: "update",
    entityKind: "filing",
    entityId: filing.id,
    before: current.status,
    after: "checked",
    actor,
    summary: `添付要件チェックを実施（不適合 ${check.ngCount}件 / 要再確認 ${check.recheckCount}件）`,
    now,
  });
  return { filing, check };
}

/* ═══════════════ ステップ４: 書類の生成（3.8.3③⑤ / 9章） ═══════════════ */

export interface GenerateDocumentsResult {
  filing: FilingPayload;
  documents: GeneratedDocumentPayload[];
}

/**
 * 届出の対象ごとに提出書類を生成する。
 * 生成時点のマスタ値を snapshot に焼き込むため、以後マスタが更新されても提出物は変わらない（12.3）。
 */
export function generateFilingDocuments(
  filingId: string,
  actor?: string,
  now = new Date(),
): GenerateDocumentsResult {
  const current = effective("filing").find((f) => f.id === filingId);
  if (!current) throw new Error("この届出は見つかりません（画面を開き直してください）");
  const generatedOn = todayLocal(now);
  const documents: GeneratedDocumentPayload[] = [];

  const isHireLike = current.filingType !== "discharge";
  const docKind = current.filingType === "hire" ? "hire_filing" : current.filingType === "discharge" ? "hire_filing" : "change_filing";

  /* ── 届出書（第六号書式 / 変更・更新届出書）: 対象1名につき1通 ── */
  for (const target of current.targets) {
    const master = crewMasterOf(target.crewMemberId);
    const vessel = vesselMasterOf(target.targetVesselId);
    documents.push(
      publishMaster(
        "generated_document",
        {
          kind: docKind,
          title:
            current.filingType === "hire"
              ? "雇入届出書（第六号書式）"
              : current.filingType === "discharge"
                ? "雇止届出書（第六号書式）"
                : "雇入契約変更（更新）届出書",
          subjectLabel: `${crewNameOf(target.crewMemberId)} / ${vesselNameOf(target.targetVesselId)}`,
          format: "html",
          generatedOn,
          filingId: current.id,
          snapshot: {
            filingType: current.filingType,
            method: current.method,
            effectiveOn: target.effectiveOn,
            duty: target.duty ?? "",
            crew: crewSnapshot(target.crewMemberId, master),
            vessel: {
              vesselId: target.targetVesselId,
              name: vesselNameOf(target.targetVesselId),
              grossTonnage: vessel?.grossTonnage,
              imoNumber: vessel?.imoNumber,
              navigationArea: vessel?.navigationArea,
            },
          },
        },
        { vesselId: COMPANY_SCOPE_ID, actor, now },
      ),
    );
  }

  /* ── クルーリスト（海員名簿第六表）: 船ごとに1通（届出時に2通提出） ── */
  if (isHireLike) {
    const vesselIds = [...new Set(current.targets.map((t) => t.targetVesselId))];
    for (const vesselId of vesselIds) {
      const rows = crewListRowsFor(vesselId, current, now);
      documents.push(
        publishMaster(
          "generated_document",
          {
            kind: "crew_list",
            title: "クルーリスト（海員名簿第六表）",
            subjectLabel: `${vesselNameOf(vesselId)} / ${rows.length}名`,
            format: "html",
            generatedOn,
            filingId: current.id,
            snapshot: {
              vessel: {
                vesselId,
                name: vesselNameOf(vesselId),
                grossTonnage: vesselMasterOf(vesselId)?.grossTonnage,
                requiredCrew: vesselMasterOf(vesselId)?.requiredCrew,
              },
              copies: 2,
              rows,
            },
          },
          { vesselId: COMPANY_SCOPE_ID, actor, now },
        ),
      );
    }
  }

  /* ── 電子届出用 雇入（止）届出書（Excel様式）: 方式②③のみ。届出1件につき1ファイル（3.8.3⑦） ── */
  if (current.method === "electronic" || current.method === "bulk_electronic") {
    documents.push(
      publishMaster(
        "generated_document",
        {
          kind: "electronic_filing_xlsx",
          title: "電子届出用 雇入（止）届出書（Excel様式）",
          subjectLabel: `${current.targets.length}名 一括`,
          format: "xlsx",
          generatedOn,
          filingId: current.id,
          snapshot: {
            filingType: current.filingType,
            method: current.method,
            rows: current.targets.map((t) => {
              const master = crewMasterOf(t.crewMemberId);
              return {
                ...crewSnapshot(t.crewMemberId, master),
                vesselName: vesselNameOf(t.targetVesselId),
                duty: t.duty ?? "",
                effectiveOn: t.effectiveOn,
              };
            }),
          },
        },
        { vesselId: COMPANY_SCOPE_ID, actor, now },
      ),
    );
  }

  const filing = publishMaster(
    "filing",
    {
      ...stripBase(current),
      status: "documents_ready",
      documentIds: [...(current.documentIds ?? []), ...documents.map((d) => d.id)],
    },
    { vesselId: COMPANY_SCOPE_ID, supersedesId: current.id, actor, now },
  );

  writeAuditLog({
    action: "create",
    entityKind: "generated_document",
    entityId: filing.id,
    after: documents.map((d) => d.title).join(" / "),
    actor,
    summary: `届出の書類を ${documents.length}件 生成（生成時点のマスタ値を保存）`,
    now,
  });

  return { filing, documents };
}

/** 生成時点の船員マスタ値（12.3: 以後マスタが更新されても提出物は書き換えない） */
function crewSnapshot(crewMemberId: string, master: CrewMasterPayload | undefined) {
  const credentials = credentialsOf("crew", crewMemberId);
  return {
    crewMemberId,
    name: master?.name ?? crewNameOf(crewMemberId),
    nameKana: master?.nameKana,
    birthDate: master?.birthDate,
    seamanBookNo: master?.seamanBookNo,
    address: master?.address,
    position: master?.position,
    credentials: credentials.map((c) => ({
      category: c.category,
      name: c.name,
      grade: c.grade,
      number: c.number,
      issuedOn: c.issuedOn,
      expiresOn: c.expiresOn,
      issuer: c.issuer,
    })),
    insurances: (master?.insurances ?? []).map((i) => ({
      kind: i.kind,
      number: i.number,
      acquiredOn: i.acquiredOn,
      lastVerifiedOn: i.lastVerifiedOn,
    })),
  };
}

/** クルーリストに載せる乗組員（現在の乗船者 ＋ この届出で乗る予定の人） */
function crewListRowsFor(vesselId: string, filing: FilingPayload, now: Date) {
  const today = todayLocal(now);
  const onBoard = new Map<string, { duty?: string; onDate?: string }>();
  const events = [...effective("embarkation")]
    .filter((e) => e.status === "actual" && e.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const e of events) {
    if (e.eventType === "on" && e.targetVesselId === vesselId) {
      onBoard.set(e.crewMemberId, { duty: e.duty, onDate: e.date });
    } else if (e.eventType === "off") {
      onBoard.delete(e.crewMemberId);
    }
  }
  for (const t of filing.targets) {
    if (t.targetVesselId === vesselId) onBoard.set(t.crewMemberId, { duty: t.duty, onDate: t.effectiveOn });
  }

  return [...onBoard.entries()].map(([crewMemberId, info], i) => {
    const master = crewMasterOf(crewMemberId);
    return {
      no: i + 1,
      crewMemberId,
      name: master?.name ?? crewNameOf(crewMemberId),
      nameKana: master?.nameKana,
      birthDate: master?.birthDate,
      seamanBookNo: master?.seamanBookNo,
      duty: info.duty ?? master?.position ?? "",
      onDate: info.onDate,
      licenseName: credentialsOf("crew", crewMemberId).find((c) => c.category === "license")?.name,
    };
  });
}

/* ═══════════════ ステップ５: 提出の記録＋船員手帳の記帳（3.8.3④） ═══════════════ */

export interface SubmitFilingInput {
  filingId: string;
  submittedOn: string;
  office: string;
  actor?: string;
  now?: Date;
}

export function submitFiling(input: SubmitFilingInput): FilingPayload {
  const now = input.now ?? new Date();
  const current = effective("filing").find((f) => f.id === input.filingId);
  if (!current) throw new Error("この届出は見つかりません（画面を開き直してください）");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.submittedOn)) throw new Error("提出日を入力してください");
  if (!input.office.trim()) throw new Error("提出先を入力してください");

  // 3.8.3④ 船員手帳の記帳情報（乗船日・下船日・船名・職務を電子記録する）
  const isDischarge = current.filingType === "discharge";
  const seamanBookEntries = current.targets.map((t) => ({
    crewMemberId: t.crewMemberId,
    vesselName: vesselNameOf(t.targetVesselId),
    duty: t.duty,
    onDate: isDischarge ? undefined : t.effectiveOn,
    offDate: isDischarge ? t.effectiveOn : undefined,
  }));

  const filing = publishMaster(
    "filing",
    {
      ...stripBase(current),
      status: "submitted",
      submittedOn: input.submittedOn,
      office: input.office.trim(),
      seamanBookEntries,
    },
    { vesselId: COMPANY_SCOPE_ID, supersedesId: current.id, actor: input.actor, now },
  );

  // 生成済み書類にも提出の事実を追記する（追記型なので supersedes で置き換える）
  for (const doc of effective("generated_document").filter((d) => d.filingId === current.id)) {
    publishMaster(
      "generated_document",
      {
        ...stripBase(doc),
        submittedOn: input.submittedOn,
        submittedTo: input.office.trim(),
        filingId: filing.id,
      },
      { vesselId: COMPANY_SCOPE_ID, supersedesId: doc.id, actor: input.actor, now },
    );
  }

  writeAuditLog({
    action: "update",
    entityKind: "filing",
    entityId: filing.id,
    before: current.status,
    after: "submitted",
    actor: input.actor,
    summary: `${input.office.trim()} へ提出（${input.submittedOn}）。船員手帳の記帳情報 ${seamanBookEntries.length}件 を記録`,
    now,
  });
  return filing;
}

/**
 * 訂正レコードを作るときに引き継ぐ業務項目だけを残す。
 * id・記録者・配信日時などの基底列は publishMaster が採番し直す（追記型の原則）。
 */
function stripBase<T extends Record<string, unknown>>(record: T): Partial<T> {
  const {
    id: _id,
    tenantId: _tenantId,
    vesselId: _vesselId,
    occurredAt: _occurredAt,
    recordedAt: _recordedAt,
    recordedBy: _recordedBy,
    deviceId: _deviceId,
    supersedesId: _supersedesId,
    publishedAt: _publishedAt,
    publishedBy: _publishedBy,
    ...rest
  } = record;
  return rest as Partial<T>;
}
