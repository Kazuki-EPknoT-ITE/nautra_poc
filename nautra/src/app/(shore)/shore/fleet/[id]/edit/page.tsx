import { notFound } from "next/navigation";
import { listVessels, vesselMasterOf } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";
import { vesselPhotoOf } from "@/server/vessel-master-service";
import { ShoreGuardNotice } from "../../../_components/guard";
import { VesselForm } from "../../_components/vessel-form";

export const dynamic = "force-dynamic";

/** 船の情報を直す（追記型。前の版は履歴に残る）と、船の写真（レビュー VESSEL-02 / VESSEL-03） */
export default async function EditVesselPage({ params }: { params: Promise<{ id: string }> }) {
  const guard = await requireShore("manage_fleet");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="船の情報を編集" />;
  const { id } = await params;
  const vessel = listVessels().find((v) => v.id === id);
  if (!vessel) notFound();
  const m = vesselMasterOf(id);
  const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  return (
    <VesselForm
      mode="edit"
      vesselId={id}
      photo={vesselPhotoOf(id)}
      values={{
        name: m?.name ?? vessel.name,
        vesselType: str(m?.vesselType),
        grossTonnage: str(m?.grossTonnage),
        imoNumber: str(m?.imoNumber),
        mmsi: str(m?.mmsi),
        navigationArea: str(m?.navigationArea),
        requiredCrew: str(m?.requiredCrew),
        builtOn: str(m?.builtOn),
        referencePeriodDays: str(m?.referencePeriodDays),
      }}
    />
  );
}
