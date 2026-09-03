"use client";

import type { ReactNode } from "react";
import type { Permission } from "@/domain/authz/roles";
import { t } from "@/i18n/ja";
import { usePermission, useSessionCrew } from "@/lib/vessel-hooks";
import { CardBody, SurfaceCard } from "@/ui";

/**
 * 権限がない場合の共通表示（基本設計書 11.2 の権限マトリクス）。
 * 画面ごとに条件分岐を書かず、判定は domain/authz の 1 か所に集約する。
 */
export function PermissionGate({
  permission,
  children,
  fallbackTitle,
  fallbackNote,
}: {
  permission: Permission;
  children: ReactNode;
  fallbackTitle?: string;
  fallbackNote?: string;
}) {
  const allowed = usePermission(permission);
  const session = useSessionCrew();
  if (allowed) return <>{children}</>;
  return (
    <SurfaceCard>
      <CardBody className="flex flex-col gap-2 p-5">
        <p className="text-lg font-bold">
          {fallbackTitle ?? "この機能は担当ロールのみ利用できます"}
        </p>
        <p className="text-foreground-600">
          現在のサインイン: {session ? `${session.name}（${t.role[session.role]}）` : "—"}
        </p>
        {fallbackNote ? <p className="text-pretty text-foreground-600">{fallbackNote}</p> : null}
      </CardBody>
    </SurfaceCard>
  );
}

/** 記録の作成権限がない場合に添える案内（画面自体は参照できる） */
export function ReadOnlyNote({ note }: { note: string }) {
  return (
    <SurfaceCard>
      <CardBody className="p-4">
        <p className="text-pretty text-foreground-600">
          <span aria-hidden="true">🔒 </span>
          参照のみ（記録の作成権限がありません）。{note}
        </p>
      </CardBody>
    </SurfaceCard>
  );
}
