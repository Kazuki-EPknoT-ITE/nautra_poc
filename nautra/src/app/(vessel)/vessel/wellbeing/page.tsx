"use client";

import { useMemo, useState } from "react";
import { t } from "@/i18n/ja";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/format";
import { useLocale } from "@/lib/use-locale";
import { appendRecord, newRecordBase } from "@/lib/vessel-actions";
import { useRecords, useSessionCrew } from "@/lib/vessel-hooks";
import { WELLBEING_FORM_TYPES } from "@/sync-protocol/records";
import {
  Button,
  Card,
  CardBody,
  Chip,
  SurfaceCard,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Radio,
  RadioGroup,
  Textarea,
  useDisclosure,
  useModalProps,
} from "@/ui";
import { GroupHeader } from "../_components/group-header";
import { RecordTile } from "../_components/record-tile";

/**
 * V-10 相談・アンケート（要件定義書 3.5.3 / 基本設計書 V-10）。
 *
 * - 健康アンケート・ストレスチェックは **1〜5の5段階を大きなボタンで選ぶ**だけにする
 *   （船員の約半数が50歳以上。大きな文字・少ないタップ数。要件定義書 10.2）
 * - **匿名が既定**。匿名を選んだ場合は `recordedBy` に "anonymous" を入れ、
 *   本人を特定できる値を一切載せない（端末IDだけは同期に必要なため載る旨を画面に明記する）
 * - 送信済みの一覧は「氏名を伝えて送ったもの」だけを出す。匿名分は端末でも本人と結びつけない
 * - 記録は追記型（`appendRecord`）。訂正・取り消しは新しい記録で表す
 */

/** 設問の並び（日本語の文面は i18n の `wellbeingQuestion` にある。画面に対応表を持たない） */
const QUESTION_KEYS: Record<"health_survey" | "stress_check", string[]> = {
  health_survey: ["sleep", "fatigue", "appetite", "mood", "workload"],
  stress_check: ["irritable", "anxious", "concentration", "isolation", "recovery"],
};

const SCALE = [1, 2, 3, 4, 5];

type SurveyForm = "health_survey" | "stress_check";

export default function WellbeingPage() {
  const session = useSessionCrew();
  const { tr } = useLocale();
  const responses = useRecords("wellbeing_response");
  const modalProps = useModalProps();
  const [done, setDone] = useState<string | null>(null);

  const surveyModal = useDisclosure();
  const consultModal = useDisclosure();

  const [formType, setFormType] = useState<SurveyForm>("health_survey");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [freeText, setFreeText] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [consultText, setConsultText] = useState("");
  const [consultAnonymous, setConsultAnonymous] = useState(true);
  const [consultError, setConsultError] = useState<string | null>(null);

  function openSurvey(kind: SurveyForm) {
    setFormType(kind);
    setAnswers({});
    setFreeText("");
    setAnonymous(true); // 匿名が既定（開くたびに戻す）
    setError(null);
    surveyModal.onOpen();
  }

  function openConsult() {
    setConsultText("");
    setConsultAnonymous(true);
    setConsultError(null);
    consultModal.onOpen();
  }

  async function submitSurvey() {
    setError(null);
    try {
      if (!session) throw new Error("サインインが必要です");
      const keys = QUESTION_KEYS[formType];
      const missing = keys.filter((k) => !answers[k]);
      if (missing.length > 0) throw new Error("すべての項目を選んでください");
      // 匿名時は記録者を "anonymous" に固定する（本人を特定できる値を載せない）
      const base = await newRecordBase(anonymous ? "anonymous" : session.id);
      await appendRecord("wellbeing_response", {
        ...base,
        formType,
        anonymous,
        answers: Object.fromEntries(keys.map((k) => [k, answers[k]])),
        message: freeText.trim() || undefined,
        status: "submitted",
      });
      setDone(
        `${tr("wellbeingFormType", formType)} を送信しました（${anonymous ? "匿名" : "氏名あり"}）`,
      );
      surveyModal.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function submitConsult() {
    setConsultError(null);
    try {
      if (!session) throw new Error("サインインが必要です");
      if (!consultText.trim()) throw new Error("相談したいこと・伝えたいことを書いてください");
      const base = await newRecordBase(consultAnonymous ? "anonymous" : session.id);
      await appendRecord("wellbeing_response", {
        ...base,
        formType: "consultation",
        anonymous: consultAnonymous,
        message: consultText.trim(),
        status: "submitted",
      });
      setDone(
        `${tr("wellbeingFormType", "consultation")} を送信しました（${consultAnonymous ? "匿名" : "氏名あり"}）`,
      );
      consultModal.onClose();
    } catch (e) {
      setConsultError(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * 自分が「氏名を伝えて送った」ものだけを出す。
   * 匿名で送ったものは端末上でも本人と結びつけない（結びつけられると匿名の意味が無くなる）。
   */
  const mine = useMemo(
    () => (session ? responses.filter((r) => !r.anonymous && r.recordedBy === session.id) : []),
    [responses, session],
  );
  const anonymousCount = useMemo(
    () => responses.filter((r) => r.anonymous).length,
    [responses],
  );

  if (!session) return null;

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="07" subtitle="相談・体調" />

      <SurfaceCard>
        <CardBody className="flex flex-col gap-2 p-5">
          <p className="text-pretty text-lg font-bold">匿名で送れます</p>
          <p className="text-pretty text-foreground-600">
            匿名を選ぶと、<strong>誰が書いたかは陸上に分かりません</strong>。届くのは内容だけです。
            氏名・船員IDは記録に載りません。ただし同期のしくみ上、
            <strong>端末の番号（端末ID）だけは付きます</strong>。同じ端末を複数の船員が共用するため、
            端末IDから個人を特定することは想定していません。
          </p>
          <p className="text-pretty text-foreground-600">
            体調のことも、人間関係のことも、困っていることは早めに書いてください。
            書いたことで不利益な扱いを受けることはありません。
          </p>
        </CardBody>
      </SurfaceCard>

      <div className="grid gap-2 sm:grid-cols-3">
        <RecordTile
          label="体調のアンケート"
          sublabel="5つの質問に答えるだけ"
          onPress={() => openSurvey("health_survey")}
        />
        <RecordTile
          label="ストレスチェック"
          sublabel="心の負担を確認する"
          onPress={() => openSurvey("stress_check")}
        />
        <RecordTile
          label="相談・通報"
          sublabel="ハラスメントの相談窓口"
          onPress={openConsult}
        />
      </div>

      {done ? (
        <Chip variant="flat" radius="sm" className="h-auto whitespace-normal py-1">
          ✓ {done}
        </Chip>
      ) : null}

      <section aria-label="送信したもの" className="flex flex-col gap-2">
        <h2 className="text-base font-bold text-foreground-600">
          あなたが氏名を伝えて送ったもの（新しい順）
        </h2>
        {mine.length === 0 ? (
          <Card shadow="none" className="ui-card">
            <CardBody>
              <p className="text-foreground-600">
                氏名を伝えて送ったものはありません。
                {anonymousCount > 0
                  ? `この端末からは匿名で ${anonymousCount}件 届いていますが、匿名分は本人と結びつけないため一覧には出しません。`
                  : ""}
              </p>
            </CardBody>
          </Card>
        ) : null}
        {mine.map((r) => (
          <Card key={r.id} shadow="none" className="ui-card">
            <CardBody className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums font-bold">{fmtDateTime(r.occurredAt)}</span>
                <Chip size="sm" variant="flat" radius="sm">
                  {tr("wellbeingFormType", r.formType)}
                </Chip>
                <Chip
                  size="sm"
                  variant="flat"
                  radius="sm"
                  color={r.status === "responded" ? "success" : "default"}
                >
                  {r.status === "responded" ? "✓ " : ""}
                  {tr("wellbeingStatus", r.status)}
                </Chip>
              </div>
              {r.answers ? (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {Object.entries(r.answers).map(([k, v]) => (
                    <li key={k}>
                      {tr("wellbeingQuestion", k)}:{" "}
                      <span className="tabular-nums font-semibold">{v}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {r.message ? <p className="text-pretty">{r.message}</p> : null}
              {r.response ? (
                <div className="ui-inset flex flex-col gap-1 p-3">
                  <span className="text-sm font-semibold">
                    陸上からの回答
                    {r.respondedAt ? `（${fmtDateTime(r.respondedAt)}）` : ""}
                  </span>
                  <p className="text-pretty">{r.response}</p>
                </div>
              ) : null}
            </CardBody>
          </Card>
        ))}
      </section>

      {/* 健康アンケート / ストレスチェック */}
      <Modal
        {...modalProps}
        isOpen={surveyModal.isOpen}
        onOpenChange={surveyModal.onOpenChange}
        placement="center"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader>{t.wellbeingFormType[formType]}</ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <p className="text-pretty text-foreground-600">
              {t.wellbeingScaleLow[formType]} 〜 {t.wellbeingScaleHigh[formType]} の5段階で、
              いまの感じにいちばん近い数字を押してください。
            </p>
            {QUESTION_KEYS[formType].map((key) => (
              <div key={key} className="flex flex-col gap-2">
                <p className="text-lg font-bold">{tr("wellbeingQuestion", key)}</p>
                {/* 選択は塗り、未選択は枠線（TriStateToggle と同じ作法。色だけに依存しない） */}
                <div role="radiogroup" aria-label={tr("wellbeingQuestion", key)} className="grid grid-cols-5 gap-2">
                  {SCALE.map((v) => {
                    const active = answers[key] === v;
                    return (
                      <Button
                        key={v}
                        role="radio"
                        aria-checked={active}
                        radius="md"
                        color={active ? "primary" : "default"}
                        variant={active ? "solid" : "bordered"}
                        onPress={() => setAnswers((prev) => ({ ...prev, [key]: v }))}
                        className={cn(
                          "min-h-16 w-full tabular-nums text-2xl font-bold",
                          !active && "border-[var(--ui-hairline-strong)] text-foreground",
                        )}
                      >
                        {v}
                      </Button>
                    );
                  })}
                </div>
                <div className="flex justify-between text-sm text-foreground-600">
                  <span>{tr("wellbeingScaleLow", formType)}</span>
                  <span>{tr("wellbeingScaleHigh", formType)}</span>
                </div>
              </div>
            ))}
            <Textarea
              label="そのほか伝えたいこと（書かなくてもかまいません）"
              value={freeText}
              onValueChange={setFreeText}
              minRows={2}
            />
            <AnonymityChoice value={anonymous} onChange={setAnonymous} crewName={session.name} />
            {error ? <p className="text-danger">✕ {error}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={surveyModal.onClose}>
              キャンセル
            </Button>
            <Button color="primary" onPress={() => void submitSurvey()}>
              送信する
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 相談・通報（ハラスメント相談窓口） */}
      <Modal
        {...modalProps}
        isOpen={consultModal.isOpen}
        onOpenChange={consultModal.onOpenChange}
        placement="center"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader>相談・通報（相談窓口）</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <p className="text-pretty text-foreground-600">
              ハラスメント・人間関係・働き方など、困っていることを書いてください。
              内容は陸上の相談窓口だけが読みます。船内で共有されることはありません。
            </p>
            <Textarea
              label="相談したいこと・伝えたいこと"
              value={consultText}
              onValueChange={setConsultText}
              minRows={5}
            />
            <AnonymityChoice
              value={consultAnonymous}
              onChange={setConsultAnonymous}
              crewName={session.name}
            />
            {consultError ? <p className="text-danger">✕ {consultError}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={consultModal.onClose}>
              キャンセル
            </Button>
            <Button color="primary" onPress={() => void submitConsult()}>
              送信する
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <p className="text-xs text-foreground-600">
        送信した内容は端末に保存され、通信が回復したときに陸上へ送られます（オフラインでも送信できます）。
        送信できる種別: {WELLBEING_FORM_TYPES.map((f) => t.wellbeingFormType[f]).join(" / ")}。
      </p>
    </div>
  );
}

/**
 * 匿名/記名の選択（既定は匿名）。
 * 「匿名を選ぶと何が起きるか」を選択肢のそばに書く（後から気づいて後悔しないようにする）。
 */
function AnonymityChoice({
  value,
  onChange,
  crewName,
}: {
  value: boolean;
  onChange: (anonymous: boolean) => void;
  crewName: string;
}) {
  return (
    <div className="ui-inset flex flex-col gap-2 p-3">
      <RadioGroup
        label="送り方"
        value={value ? "anonymous" : "named"}
        onValueChange={(v) => onChange(v === "anonymous")}
      >
        <Radio value="anonymous">匿名で送る（既定）</Radio>
        <Radio value="named">氏名を伝えて送る（{crewName}）</Radio>
      </RadioGroup>
      <p className="text-pretty text-sm text-foreground-600">
        {value
          ? "誰が書いたかは陸上に分かりません。内容だけが届きます。返事が必要な場合も個人あてには返せないため、この一覧には表示されません。"
          : "氏名が陸上に伝わります。陸上からの回答をこの画面で受け取れます。"}
      </p>
    </div>
  );
}
