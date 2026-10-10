/**
 * 画像を枠の大きさまで縮めて JPEG の data URL にする（切り抜きはせず、収まるように縮小する）。
 *
 * 写真は**端末側で縮めてから**送る。原寸のまま持つと同期イベントが数MBになり、
 * 回線の細い船内への配信や一覧の表示が重くなるため（要件定義書 10.1）。
 * 顔写真（縦長）と船の写真（横長）で同じ処理を使う。
 */
export function shrinkImage(file: File, maxW: number, maxH: number, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no 2d context"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
