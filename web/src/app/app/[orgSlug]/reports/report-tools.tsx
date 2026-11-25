"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function ReportGenerator({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(() => iso(new Date()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId, from, to }) });
    const b = (await r.json().catch(() => ({}))) as { error?: string; missing?: string[] };
    setBusy(false);
    if (!r.ok) return setErr(b.error === "not_configured" ? `Not configured: ${(b.missing ?? []).join(", ")}` : (b.error ?? "Could not generate the report."));
    router.refresh();
  }

  return (
    <Card className="mb-4 flex flex-wrap items-end gap-3 p-5">
      <div>
        <Label htmlFor="rep-from">From</Label>
        <Input id="rep-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="rep-to">To</Label>
        <Input id="rep-to" type="date" value={to} min={from} max={iso(new Date())} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Button onClick={generate} loading={busy}>Generate report</Button>
      {err ? <p className="text-sm text-bad" role="alert">{err}</p> : null}
    </Card>
  );
}

export function DigestToggle() {
  const [optOut, setOptOut] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/me/digest").then((r) => r.json()).then((b: { optOut?: boolean }) => setOptOut(!!b.optOut)).catch(() => setOptOut(false));
  }, []);
  async function toggle(on: boolean) {
    setOptOut(!on);
    const r = await fetch("/api/me/digest", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ optOut: !on }) });
    if (!r.ok) setOptOut(on);
  }
  return (
    <Card className="mt-4 flex items-center justify-between gap-4 p-5">
      <div>
        <h2 className="font-sans text-md font-semibold text-ink">Weekly email digest</h2>
        <p className="text-sm text-ink-3">Mondays: visibility, gaps and competitor movers. This setting is yours only.</p>
      </div>
      <Switch checked={optOut === false} disabled={optOut === null} onCheckedChange={toggle} aria-label="Receive the weekly digest" />
    </Card>
  );
}
