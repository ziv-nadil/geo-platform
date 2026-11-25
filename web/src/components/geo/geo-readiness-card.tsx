"use client";

import { Card } from "@/components/ui/card";
import { GeoReport, useGeoAudit, type GeoAuditData } from "./geo-report";

/** "GEO readiness" card (Site health page) and wizard panel body. */
export function GeoReadinessCard({ orgId, initial, compact }: { orgId: string; initial: GeoAuditData | null; compact?: boolean }) {
  const g = useGeoAudit(orgId, initial);
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-sans text-md font-semibold text-ink">GEO readiness</h3>
      <GeoReport {...g} rerun={g.rerun} compact={compact} />
    </Card>
  );
}
