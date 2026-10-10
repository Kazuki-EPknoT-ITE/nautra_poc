import { requireShore } from "@/server/shore-session";
import { ShoreGuardNotice } from "../../_components/guard";
import { VesselForm } from "../_components/vessel-form";

export const dynamic = "force-dynamic";

/**
 * 船の登録（レビュー VESSEL-02 / ASSIGN-04）。アプリ全体で船の登録はここだけ。
 * 配乗計画の「＋ 船を登録」からも来る（`back` に戻り先を持たせ、登録後はそこへ戻す）。
 */
export default async function NewVesselPage({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  const guard = await requireShore("manage_fleet");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="船の登録" />;
  const sp = await searchParams;
  const back = sp.back?.startsWith("/shore/") ? sp.back : undefined;
  return (
    <VesselForm
      mode="new"
      back={back}
      values={{
        name: "",
        vesselType: "",
        grossTonnage: "",
        imoNumber: "",
        mmsi: "",
        navigationArea: "",
        requiredCrew: "",
        builtOn: "",
        referencePeriodDays: "",
      }}
    />
  );
}
