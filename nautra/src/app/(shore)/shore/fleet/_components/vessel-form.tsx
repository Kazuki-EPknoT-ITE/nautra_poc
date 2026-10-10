"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { shrinkImage } from "@/lib/shrink-image";
import {
  createVesselAction,
  saveVesselPhotoAction,
  updateVesselAction,
  type FleetFormState,
} from "../actions";

/** 船の写真は横長の枠（一覧・管理ページの見出しに合わせる） */
const PHOTO_W = 480;
const PHOTO_H = 300;

export interface VesselFormValues {
  name: string;
  vesselType: string;
  grossTonnage: string;
  imoNumber: string;
  mmsi: string;
  navigationArea: string;
  requiredCrew: string;
  builtOn: string;
  referencePeriodDays: string;
}

const INITIAL: FleetFormState = { ok: false, message: "" };

/** よく使う船種・航行区域（候補として出し、自由にも書ける） */
const VESSEL_TYPES = ["貨物船", "石灰石船", "セメント船", "タンカー", "RORO船", "フェリー", "コンテナ船"];
const AREAS = ["平水", "沿海", "近海", "遠洋"];

/**
 * 船の登録・編集（レビュー VESSEL-02 / VESSEL-03）。
 *
 * 入力欄は船名を先頭に、**必須は船名だけ**。残りは分かる範囲で入れ、あとから足せる。
 * 写真は選んだ時点で縮めて保存する（編集時）。新規登録では登録と一緒に送る。
 */
export function VesselForm({
  mode,
  vesselId,
  values,
  photo,
  back,
}: {
  mode: "new" | "edit";
  vesselId?: string;
  values: VesselFormValues;
  photo?: string;
  back?: string;
}) {
  const [state, formAction, pending] = useActionState(mode === "new" ? createVesselAction : updateVesselAction, INITIAL);
  return (
    <form action={formAction} className="ui-card flex flex-col gap-5 px-[18px] py-5">
      {vesselId ? <input type="hidden" name="vesselId" value={vesselId} /> : null}
      {back ? <input type="hidden" name="back" value={back} /> : null}

      <VesselPhotoField vesselId={mode === "edit" ? vesselId : undefined} initial={photo} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Field name="name" label="船名" required defaultValue={values.name} placeholder="例: 第一昭運丸" />
        <Field name="vesselType" label="船種" defaultValue={values.vesselType} placeholder="例: 石灰石船" list="vessel-types" />
        <Field name="grossTonnage" label="総トン数" defaultValue={values.grossTonnage} placeholder="例: 499" inputMode="decimal" />
        <Field name="navigationArea" label="航行区域" defaultValue={values.navigationArea} placeholder="例: 沿海" list="vessel-areas" />
        <Field name="requiredCrew" label="法定定員（名）" defaultValue={values.requiredCrew} placeholder="例: 5" inputMode="numeric" />
        <Field name="builtOn" label="建造日" type="date" defaultValue={values.builtOn} />
        <Field name="imoNumber" label="IMO番号（7桁）" defaultValue={values.imoNumber} placeholder="例: 9876543" inputMode="numeric" />
        <Field name="mmsi" label="MMSI（9桁）" defaultValue={values.mmsi} placeholder="例: 431000000" inputMode="numeric" />
        <Field
          name="referencePeriodDays"
          label="基準労働期間（日）"
          defaultValue={values.referencePeriodDays}
          placeholder="例: 28"
          inputMode="numeric"
        />
      </div>
      <datalist id="vessel-types">
        {VESSEL_TYPES.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="vessel-areas">
        {AREAS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      {state.message ? (
        <p role="status" className={state.ok ? "m-0 text-base text-foreground-800" : "m-0 text-base text-danger"}>
          {state.ok ? "✓" : "✕"} {state.message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button type="submit" className="ui-btn-primary h-11 px-6" disabled={pending}>
          {pending ? "保存中…" : mode === "new" ? "船を登録する" : "保存する"}
        </button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  required,
  type = "text",
  ...rest
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  inputMode?: "numeric" | "decimal";
  list?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold text-foreground-700">
        {label}
        {required ? <span className="ml-1 text-danger">＊</span> : null}
      </span>
      <input name={name} type={type} required={required} className="ui-field" {...rest} />
    </label>
  );
}

/** 船の写真（横長）。編集時は選んだ時点で保存、新規登録では登録と一緒に送る */
function VesselPhotoField({ vesselId, initial }: { vesselId?: string; initial?: string }) {
  const [src, setSrc] = useState(initial ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function save(dataUrl: string) {
    setSrc(dataUrl);
    setError(null);
    setMessage(null);
    if (!vesselId) return;
    startTransition(async () => {
      const res = await saveVesselPhotoAction(vesselId, dataUrl);
      if (res.ok) setMessage(res.message);
      else setError(res.message);
    });
  }

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="flex h-[150px] w-[240px] flex-none items-center justify-center overflow-hidden rounded-[12px] border border-[var(--ui-hairline-strong)] bg-content2">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="船の写真" className="h-full w-full object-cover" />
        ) : (
          <span className="font-mono text-xs tracking-[0.14em] text-foreground-500">PHOTO</span>
        )}
      </div>
      <div className="flex flex-col items-start gap-2">
        {vesselId ? null : <input type="hidden" name="photoDataUrl" value={src} />}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="船の写真を選ぶ"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (!f.type.startsWith("image/")) return setError("画像ファイルを選んでください");
            try {
              save(await shrinkImage(f, PHOTO_W, PHOTO_H));
            } catch {
              setError("この画像は読み込めませんでした。別のファイルでお試しください");
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending} onClick={() => fileRef.current?.click()} className="ui-btn-ghost h-9">
            写真を選ぶ
          </button>
          {src ? (
            <button type="button" disabled={pending} onClick={() => save("")} className="ui-btn-ghost h-9 text-danger">
              写真を外す
            </button>
          ) : null}
          {pending ? <span className="text-sm text-primary">保存中…</span> : null}
        </div>
        {message ? <p className="m-0 text-sm font-semibold text-foreground-800">✓ {message}</p> : null}
        {error ? <p className="m-0 text-sm text-danger">✕ {error}</p> : null}
      </div>
    </div>
  );
}
