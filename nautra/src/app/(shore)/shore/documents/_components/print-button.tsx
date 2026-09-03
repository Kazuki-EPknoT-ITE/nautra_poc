"use client";

import { Button } from "@/ui";

/** ブラウザの印刷ダイアログを開く（PDF 保存もここから行う） */
export function PrintButton() {
  return (
    <Button color="primary" onPress={() => window.print()}>
      印刷する（PDF 保存）
    </Button>
  );
}
