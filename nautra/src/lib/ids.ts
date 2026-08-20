const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford Base32

/**
 * ULID 生成（端末採番・時系列ソート可能。基本設計書 5.3(4)）。
 * 依存を増やさないための最小実装。
 */
export function ulid(now: number = Date.now()): string {
  let time = now;
  let ts = "";
  for (let i = 0; i < 10; i++) {
    ts = ENCODING[time % 32] + ts;
    time = Math.floor(time / 32);
  }
  let rand = "";
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 16; i++) rand += ENCODING[bytes[i] % 32];
  } else {
    for (let i = 0; i < 16; i++) rand += ENCODING[Math.floor(Math.random() * 32)];
  }
  return ts + rand;
}
