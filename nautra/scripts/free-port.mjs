import { execFileSync } from "node:child_process";

/**
 * 指定したポートを掴んでいるプロセスを止める（既定は 3100）。
 *
 *   node scripts/free-port.mjs        # 3100 を空ける
 *   node scripts/free-port.mjs 3000   # ポートを指定する
 *
 * なぜ要るか: `next dev` / `next start` は npx → next → next-server と入れ子で動くため、
 * 端末を閉じたり Ctrl+C を取りこぼしたりすると**子だけが生き残ってポートを掴み続ける**。
 * すると次の起動が `EADDRINUSE` で落ちる。起動のたびに手で PID を調べて消すのは煩わしいので、
 * `predev` / `prestart` からこれを呼び、**起動する前に必ず空いている状態**にしてある。
 *
 * 巻き添えを避けるため、**そのポートを実際に LISTEN しているプロセスだけ**を止める。
 * `node.exe` を名前で一括終了すると、無関係の常駐（Adobe や各種 MCP サーバ）まで落ちる。
 */

const port = Number(process.argv[2] ?? 3100);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`[free-port] ポート番号が不正です: ${process.argv[2]}`);
  process.exit(1);
}

/** そのポートを LISTEN している PID（重複を除く） */
function listeners() {
  const pids = new Set();
  try {
    if (process.platform === "win32") {
      const out = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
      for (const line of out.split(/\r?\n/)) {
        // 例: "  TCP    0.0.0.0:3100    0.0.0.0:0    LISTENING    21304"
        const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
        if (m && Number(m[1]) === port) pids.add(m[2]);
      }
    } else {
      const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
        encoding: "utf8",
      });
      for (const id of out.split(/\s+/)) if (id) pids.add(id);
    }
  } catch {
    // netstat / lsof が無い、または該当なし。空のまま返す
  }
  // 自分自身は止めない（念のため）
  pids.delete(String(process.pid));
  return [...pids];
}

const found = listeners();
if (found.length === 0) {
  console.log(`[free-port] ${port} は空いています`);
  process.exit(0);
}

for (const pid of found) {
  try {
    if (process.platform === "win32") {
      // /T を付けて子まで落とす。付けないと next-server が残ってポートを掴んだままになる
      execFileSync("taskkill", ["/F", "/T", "/PID", pid], { stdio: "ignore" });
    } else {
      process.kill(Number(pid), "SIGKILL");
    }
    console.log(`[free-port] ${port} を掴んでいた PID ${pid} を終了しました`);
  } catch {
    console.error(`[free-port] PID ${pid} を終了できませんでした（権限を確認してください）`);
  }
}

/** OS がポートを手放すまで少し待つ（直後に起動すると TIME_WAIT で掴めないことがある） */
const until = Date.now() + 3000;
while (listeners().length > 0 && Date.now() < until) {
  execFileSync(process.execPath, ["-e", "setTimeout(()=>{},150)"], { stdio: "ignore" });
}

if (listeners().length > 0) {
  console.error(`[free-port] ${port} がまだ塞がっています。手動で確認してください`);
  process.exit(1);
}
console.log(`[free-port] ${port} が空きました`);
