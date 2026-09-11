import Link from "next/link";
import { hasShorePermission, requireShore } from "@/server/shore-session";
import { INSURANCE_KINDS } from "@/sync-protocol/records";
import { ShoreGuardNotice } from "../../_components/guard";
import {
  CrewMasterForm,
  type CrewMasterFormValues,
} from "../[id]/edit/_components/crew-master-form";

export const dynamic = "force-dynamic";

/**
 * S-04 船員の新規登録（デザイン正本 `design/poc_design` の「＋ 船員を登録」）。
 *
 * 編集と**同じフォーム**を使う。入力欄が2つに分かれると、片方だけ直して食い違う——
 * 要件定義書 12.3 が禁じている状態が生まれるため。登録後は資格・証書の画面へ送り、
 * 配乗の判定に必要な写しをその場で入れられるようにする。
 */
export default async function ShoreCrewNewPage() {
  const guard = await requireShore("edit_crew_master");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="船員の登録" />;

  const canEditSensitive = await hasShorePermission("view_sensitive_health");

  const values: CrewMasterFormValues = {
    crewMemberId: "",
    name: "",
    nameKana: "",
    birthDate: "",
    seamanBookNo: "",
    address: "",
    bloodType: "",
    phone: "",
    position: "",
    employmentType: "",
    hiredOn: "",
    emergencyContactName: "",
    emergencyContactRelation: "",
    emergencyContactPhone: "",
    familyNote: "",
    medicalHistory: canEditSensitive ? "" : undefined,
    medication: canEditSensitive ? "" : undefined,
    insurances: INSURANCE_KINDS.map((kind) => ({
      kind,
      number: "",
      acquiredOn: "",
      lastVerifiedOn: "",
      verifyMethod: "",
    })),
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-foreground-500">
          登録すると、続けて資格・証書の画面へ進みます。海技免状・健康証明書・基本訓練修了証を
          入れると、その場で配乗の可否が判定されます（3.1.2）。
        </p>
        <Link href="/shore/crew" className="ui-btn-ghost h-9">
          ← 船員一覧へ戻る
        </Link>
      </div>

      <CrewMasterForm values={values} age={null} canEditSensitive={canEditSensitive} mode="new" />
    </div>
  );
}
