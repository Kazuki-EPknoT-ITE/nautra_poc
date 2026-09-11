"use client";

import { useRef, useState } from "react";
import { CrewPhoto } from "@/ui";

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
 * PoC は縮小後の data URL を船員マスタに持たせる。本番はオブジェクトストレージに
 * 置き、マスタには鍵だけを持たせる（`photoDataUrl` のコメント参照）。
 */
export function PhotoField({
  name,
  initial,
  defaultValue,
}: {
  name: string;
  initial?: string;
  defaultValue?: string;
}) {
  const [src, setSrc] = useState(defaultValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選んでください");
      return;
    }
    try {
      const dataUrl = await shrink(file);
      setSrc(dataUrl);
    } catch {
      setError("この画像は読み込めませんでした。別のファイルでお試しください");
    }
  }

  return (
    <div className="flex items-start gap-4">
      <CrewPhoto name={name} initial={initial} src={src || undefined} size="xl" />
      <div className="flex flex-col items-start gap-2">
        <p className="m-0 text-sm text-foreground-500">
          顔写真（任意）。共用端末の配乗ボードや作業割当で「顔で選ぶ」ために使います。
        </p>
        <input type="hidden" name="photoDataUrl" value={src} />
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
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="ui-btn-ghost h-9">
            写真を選ぶ
          </button>
          {src ? (
            <button type="button" onClick={() => setSrc("")} className="ui-btn-ghost h-9 text-danger">
              写真を外す
            </button>
          ) : null}
        </div>
        {error ? <p className="m-0 text-sm text-danger">✕ {error}</p> : null}
        <p className="m-0 text-xs leading-relaxed text-foreground-400">
          選んだ画像はこの端末で {MAX_W}×{MAX_H} まで縮めてから保存します（原寸のままだと
          船内への配信が重くなるため）。保存すると、ほかの画面の顔写真もこの1枚に揃います。
        </p>
      </div>
    </div>
  );
}

/** 画像を枠の大きさまで縮めて data URL にする（切り抜きはせず、収まるように縮小する） */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const scale = Math.min(MAX_W / img.width, MAX_H / img.height, 1);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no 2d context"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", QUALITY));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
