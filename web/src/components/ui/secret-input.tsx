"use client";

import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { storeSecret } from "@/lib/ui/api-client";
import { cn } from "@/lib/ui/cn";
import { Button } from "./button";
import { controlClass } from "./input";

export interface SecretState {
  stored: boolean;
  ref?: string;
  last4?: string;
  storedAt?: string;
}

/**
 * Masked secret field. The value lives only in the uncontrolled <input> until submit; it is
 * posted to /api/onboarding/:orgId/secrets and the input is wiped immediately afterwards
 * (success or failure). Only a reference ("stored", optional last 4) is kept in React state.
 */
export function SecretInput({
  id,
  orgId,
  stepId,
  fieldId,
  state,
  onStored,
  placeholder = "Paste the secret",
  describedBy,
}: {
  id: string;
  orgId: string;
  stepId: string;
  fieldId: string;
  state?: SecretState;
  onStored: (s: SecretState) => void;
  placeholder?: string;
  describedBy?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasText, setHasText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  async function submit() {
    const el = inputRef.current;
    if (!el || !el.value) return;
    const value = el.value;
    setBusy(true);
    setError(null);
    const res = await storeSecret(orgId, stepId, fieldId, value);
    // Wipe the DOM value regardless of outcome. Nothing else holds it.
    el.value = "";
    setHasText(false);
    setReveal(false);
    setBusy(false);
    if (res.available) {
      onStored({ stored: true, ref: res.data.ref, last4: res.data.last4, storedAt: new Date().toISOString() });
      setReplacing(false);
    } else {
      setError(`Not saved. ${res.error} The secret vault (Infisical) is not connected in this environment, so the value was discarded. Re-enter it once the vault is live.`);
    }
  }

  if (state?.stored && !replacing) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-sm border border-good/30 bg-good-soft px-3 py-2">
        <span className="flex items-center gap-2 text-sm text-good">
          <ShieldCheck className="size-4" aria-hidden="true" />
          Stored in the vault{state.last4 ? ` · ends in ${state.last4}` : ""}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setReplacing(true)}>
          Replace
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-4" aria-hidden="true" />
          <input
            ref={inputRef}
            id={id}
            type={reveal ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            placeholder={placeholder}
            aria-describedby={describedBy}
            onChange={(e) => setHasText(e.target.value.length > 0)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            className={cn(controlClass, "h-9 pr-9 pl-9 font-mono text-sm")}
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-xs p-1 text-ink-3 hover:text-ink"
            aria-label={reveal ? "Hide secret" : "Show secret"}
          >
            {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <Button variant="secondary" onClick={submit} disabled={!hasText} loading={busy}>
          Save to vault
        </Button>
        {replacing ? (
          <Button variant="ghost" onClick={() => setReplacing(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
      <p className="flex items-center gap-1 text-xs text-ink-3">
        <ShieldCheck className="size-3" aria-hidden="true" /> Sent straight to the encrypted vault. We never show it again.
      </p>
      {error ? (
        <p className="text-xs font-medium text-bad" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
