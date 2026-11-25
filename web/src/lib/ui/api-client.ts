/**
 * Client-side calls to the backend API (owned by the backend agent under src/app/api).
 * When a route is missing or not configured the caller gets `{ available: false, error }` and
 * the UI says so. Nothing is simulated.
 *
 *   GET  /api/intake/key                         -> { keys: JWK[], alg, enc }
 *   POST /api/onboarding/:orgId/secrets          header x-beacon-intake: 1, body { jwe: string[] }
 *   POST /api/onboarding/:orgId/test/:stepId     -> { status, checks: [{id,label,ok,detail}], missing, ranAt }
 *   PUT  /api/onboarding/:orgId/progress         body { stepId, data?, status?, notes? }
 */
import { CompactEncrypt, importJWK, type JWK } from "jose";

export type CheckStatus = "pass" | "partial" | "fail";

export interface TestResult {
  testId: string;
  status: CheckStatus;
  summary: string;
  missing?: string[];
  checks?: { label: string; status: CheckStatus; detail?: string }[];
  ranAt: string;
}

export type ApiOutcome<T> = { available: true; data: T } | { available: false; error: string };

async function call<T>(url: string, init: RequestInit): Promise<ApiOutcome<T>> {
  try {
    const res = await fetch(url, init);
    if (res.status === 404 || res.status === 405 || res.status === 501) return { available: false, error: "This endpoint is not deployed yet." };
    const body = (await res.json().catch(() => ({}))) as T & { error?: string; status?: string; missing?: string[] };
    if (res.status === 503 || body.status === "not_configured") return { available: false, error: `Not configured on the server${body.missing?.length ? ` (${body.missing.join(", ")})` : ""}.` };
    if (res.status === 401) return { available: false, error: "Your session expired. Sign in again." };
    if (res.status === 403) return { available: false, error: "Your role can't do this. Ask an account admin." };
    if (!res.ok) return { available: false, error: body.error ? `Request failed (${body.error}).` : `Request failed (${res.status}).` };
    return { available: true, data: body };
  } catch {
    return { available: false, error: "Network error. Check your connection and try again." };
  }
}

/**
 * Encrypt the secret in the browser to the server's intake key (JWE, ECDH-ES+A256KW / A256GCM)
 * and post only the ciphertext. The plaintext never leaves this function.
 */
export async function storeSecret(orgId: string, stepId: string, fieldId: string, value: string): Promise<ApiOutcome<{ stored: boolean }>> {
  const keyRes = await call<{ keys: JWK[] }>("/api/intake/key", { method: "GET" });
  if (!keyRes.available) return keyRes;
  const jwk = keyRes.data.keys?.[0];
  if (!jwk?.kid) return { available: false, error: "No intake key published." };
  const now = Math.floor(Date.now() / 1000);
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const key = await importJWK(jwk, "ECDH-ES+A256KW");
  const jwe = await new CompactEncrypt(new TextEncoder().encode(JSON.stringify({ org_id: orgId, step_id: stepId, field_id: fieldId, value, iat: now, exp: now + 240, nonce })))
    .setProtectedHeader({ alg: "ECDH-ES+A256KW", enc: "A256GCM", kid: jwk.kid })
    .encrypt(key);
  const res = await call<{ status: string }>(`/api/onboarding/${orgId}/secrets`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-beacon-intake": "1" },
    body: JSON.stringify({ jwe: [jwe] }),
  });
  return res.available ? { available: true, data: { stored: res.data.status === "stored" } } : res;
}

/** Run the live test for a whole step. Returns the raw server result. */
export async function runStepTest(orgId: string, stepId: string) {
  return call<{ status: "pass" | "partial" | "fail" | "not_configured"; checks: { id: string; label: string; ok: boolean; detail?: string }[]; missing: string[]; ranAt?: string }>(
    `/api/onboarding/${orgId}/test/${stepId}`,
    { method: "POST", headers: { "content-type": "application/json", "x-beacon-intake": "1" }, body: "{}" },
  );
}

export function saveProgress(orgId: string, stepId: string, data: Record<string, unknown>, status: "not_started" | "in_progress", notes?: string | null) {
  return call<{ ok?: boolean }>(`/api/onboarding/${orgId}/progress`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stepId, data, status, notes: notes ?? null }),
  });
}

/** File uploads: POST /api/onboarding/:orgId/files (validated server-side, private Storage buckets). */
export async function uploadFile(orgId: string, stepId: string, fieldId: string, file: File): Promise<ApiOutcome<{ path: string }>> {
  const fd = new FormData();
  fd.set("stepId", stepId);
  fd.set("fieldId", fieldId);
  fd.set("file", file);
  return call<{ path: string }>(`/api/onboarding/${orgId}/files`, { method: "POST", body: fd });
}
