/**
 * Client-side calls to the backend API (owned by the backend agent under src/app/api).
 * Every call degrades gracefully: when the route is missing (404/405) or Supabase is not
 * provisioned, the caller gets `{ available: false }` and the UI falls back to a clearly
 * labelled simulation. Contract expected from the backend:
 *
 *   POST /api/onboarding/:orgId/secrets   { stepId, fieldId, value }        -> { ok: true, ref: string, last4?: string }
 *   POST /api/onboarding/:orgId/files     multipart { stepId, fieldId, file } -> { ok: true, path: string }
 *   POST /api/onboarding/:orgId/tests     { stepId, testId, values }         -> TestResult
 *   PUT  /api/onboarding/:orgId           { stepId, values, status }         -> { ok: true }
 */
export type CheckStatus = "pass" | "partial" | "fail";

export interface TestResult {
  testId: string;
  status: CheckStatus;
  summary: string;
  missing?: string[];
  checks?: { label: string; status: CheckStatus; detail?: string }[];
  simulated?: boolean;
  ranAt: string;
}

export type ApiOutcome<T> = { available: true; data: T } | { available: false; error: string };

async function call<T>(url: string, init: RequestInit): Promise<ApiOutcome<T>> {
  try {
    const res = await fetch(url, init);
    if (res.status === 404 || res.status === 405 || res.status === 501) {
      return { available: false, error: "This endpoint is not deployed yet." };
    }
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { available: false, error: body.error ?? `Request failed (${res.status}).` };
    return { available: true, data: body };
  } catch {
    return { available: false, error: "Network error. Check your connection and try again." };
  }
}

export function storeSecret(orgId: string, stepId: string, fieldId: string, value: string) {
  return call<{ ok: boolean; ref: string; last4?: string }>(`/api/onboarding/${orgId}/secrets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stepId, fieldId, value }),
  });
}

export function uploadFile(orgId: string, stepId: string, fieldId: string, file: File) {
  const fd = new FormData();
  fd.set("stepId", stepId);
  fd.set("fieldId", fieldId);
  fd.set("file", file);
  return call<{ ok: boolean; path: string }>(`/api/onboarding/${orgId}/files`, { method: "POST", body: fd });
}

export function runTest(orgId: string, stepId: string, testId: string, values: Record<string, unknown>) {
  return call<TestResult>(`/api/onboarding/${orgId}/tests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stepId, testId, values }),
  });
}

export function saveStep(orgId: string, stepId: string, values: Record<string, unknown>, status: string) {
  return call<{ ok: boolean }>(`/api/onboarding/${orgId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stepId, values, status }),
  });
}
