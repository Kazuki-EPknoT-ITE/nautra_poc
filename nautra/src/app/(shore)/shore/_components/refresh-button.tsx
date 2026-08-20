"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/ui";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      color="primary"
      variant="bordered"
      isLoading={pending}
      onPress={() => startTransition(() => router.refresh())}
    >
      最新の受信状況に更新
    </Button>
  );
}
