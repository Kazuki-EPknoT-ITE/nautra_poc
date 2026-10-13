"use client";

import { useActionState, useRef, useState } from "react";
import { Button, Textarea } from "@/ui/heroui";
import { importLedgerAction, type ImportFormState } from "../actions";

const INITIAL: ImportFormState = {
  ok: false,
  phase: "idle",
  message: "",
  okRows: [],
  ngRows: [],
};

/**
 * 国交省公表の労務管理記録簿 Excel マクロ様式からの取込（要件定義書 3.2.2）。
 *
 * PoC は **Excel 様式を CSV として保存したもの**を受け取る（外部ライブラリを増やさない）。
 * 貼り付け／ファイル選択 →「内容を確認する」で検証結果を見せ、
 * 問題のない行だけを **打刻レコードとして追記** する（既存の記録は上書きしない）。
 */
export function LedgerImportForm() {
  const [state, formAction, pending] = useActionState<ImportFormState, FormData>(
    importLedgerAction,
    INITIAL,
  );
  const [mode, setMode] = useState<"preview" | "commit">("preview");
  const [csv, setCsv] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsv(await file.text());
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="mode" value={mode} />
      <ol
        className="m-0 flex flex-wrap gap-x-6 gap-y-1 pl-5 text-sm text-foreground-700"
        title="日付・船員・作業種別・開始・終了の列があれば、列の並びや見出しの書き方が違っても読み取ります"
      >
        <li>Excel の記録簿を「CSV UTF-8」で保存</li>
        <li>ファイルを選ぶか、中身を貼り付ける</li>
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={onPickFile}
          className="text-sm"
          aria-label="取り込むファイルを選ぶ"
        />
        {csv ? (
          <Button
            size="sm"
            variant="bordered"
            onPress={() => {
              setCsv("");
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            入力を消す
          </Button>
        ) : null}
      </div>

      <Textarea
        name="csv"
        label="ファイルの中身（貼り付け）"
        minRows={4}
        value={csv}
        onValueChange={setCsv}
        placeholder={"日付,船員氏名,作業種別,開始,終了,備考\n2026-04-01,高松 誠,航海当直,08:00,12:00,"}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="bordered"
          isLoading={pending && mode === "preview"}
          isDisabled={!csv.trim()}
          onPress={() => setMode("preview")}
        >
          内容を確認する
        </Button>
        <Button
          type="submit"
          title="取り込んだ勤務は「事後入力」として追記し、備考に「Excel様式から取込」と残します。 同じ勤務を二度取り込んでも記録は増えません。"
          color="primary"
          isLoading={pending && mode === "commit"}
          isDisabled={state.phase !== "preview" || state.okRows.length === 0}
          onPress={() => setMode("commit")}
        >
          この内容で取り込む
        </Button>
        {state.message ? (
          <p className={state.ok ? "text-sm font-semibold" : "text-sm text-danger"}>
            {state.ok ? "✓ " : "⚠ "}
            {state.message}
          </p>
        ) : null}
      </div>

      {state.okRows.length > 0 || state.ngRows.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="ui-inset p-3">
            <p className="mb-1 text-sm font-semibold">
              取り込める行 <span className="tabular-nums">{state.okRows.length}</span> 件
            </p>
            {state.okRows.length === 0 ? (
              <p className="text-sm text-foreground-500">ありません。</p>
            ) : (
              <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto text-sm">
                {state.okRows.slice(0, 100).map((r) => (
                  <li key={`ok-${r.line}`} className="tabular-nums">
                    <span className="text-foreground-500">{r.line}行目</span> {r.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="ui-inset p-3">
            <p className="mb-1 text-sm font-semibold text-danger">
              ✕ 取り込めない行 <span className="tabular-nums">{state.ngRows.length}</span> 件
            </p>
            {state.ngRows.length === 0 ? (
              <p className="text-sm text-foreground-500">ありません。</p>
            ) : (
              <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto text-sm">
                {state.ngRows.slice(0, 100).map((r) => (
                  <li key={`ng-${r.line}`}>
                    <span className="tabular-nums text-foreground-500">
                      {r.line > 0 ? `${r.line}行目` : "ファイル全体"}
                    </span>{" "}
                    {r.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

    </form>
  );
}
