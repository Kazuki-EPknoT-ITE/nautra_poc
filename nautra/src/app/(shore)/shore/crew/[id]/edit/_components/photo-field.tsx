"use client";

import { useRef, useState, useTransition } from "react";
import { shrinkImage } from "@/lib/shrink-image";
import { CrewPhoto } from "@/ui";
import { saveCrewPhotoAction } from "../actions";

/** 保存する写真の大きさ（縦長の枠に合わせる）。これ以上大きくしても一覧では見分けが付かない */
const MAX_W = 248;
const MAX_H = 310;
/** 端末で縮めたあとの目安（JPEG 品質 0.8 でおよそ 20〜40KB） */
const QUALITY = 0.8;

/**
 * 顔写真の登録（デザイン正本 `design/poc_design` の `image-slot`）。
 *
 * **端末側で縮めてから**送る。原寸のまま持つと同期イベントが数MBになり、
 * 回線の細い船内への配信が重くなるため（要件定義書 10.1）。
 *
 * 保存は**マスタとは別**の経路で、選んだ時点で即座に保存する。マスタの保存ボタンに
 * ぶら下げると「写真だけ直したいのに氏名も再送する」ことになり、マスタの版が
 * 写真の差し替えのたびに増えてしまうため（写真は `crew_photo` エンティティ）。
 */
export function PhotoField({
  crewMemberId,
  name,
  initial,
  defaultValue,
}: {
  crewMemberId: string;
  name: string;
  initial?: string;
  defaultValue?: string;
}) {
  const [src, setSrc] = useState(defaultValue ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  /** 新規登録の画面（まだ船員IDが無い）では、保存はマスタ登録のあとになる */
  const canSaveNow = Boolean(crewMemberId);

  function save(dataUrl: string) {
    setSrc(dataUrl);
    setError(null);
    setMessage(null);
    if (!canSaveNow) return;
    startTransition(async () => {
      const res = await saveCrewPhotoAction(crewMemberId, dataUrl);
      if (res.ok) setMessage(res.message);
      else setError(res.message);
    });
  }

  async function pick(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選んでください");
      return;
    }
    try {
      save(await shrinkImage(file, MAX_W, MAX_H, QUALITY));
    } catch {
      setError("この画像は読み込めませんでした。別のファイルでお試しください");
    }
  }

  return (
    <div className="flex items-start gap-4">
      <CrewPhoto name={name} initial={initial} src={src || undefined} size="xl" />
      <div className="flex flex-col items-start gap-2">
        {/* 新規登録のときだけ、マスタ登録と一緒に送る */}
        {canSaveNow ? null : <input type="hidden" name="photoDataUrl" value={src} />}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => fileRef.current?.click()}
            className="ui-btn-ghost h-9"
          >
            写真を選ぶ
          </button>
          {src ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => save("")}
              className="ui-btn-ghost h-9 text-danger"
            >
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
