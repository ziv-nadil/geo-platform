/** /admin access rule: non-staff see a 404 (the console must not be discoverable); staff need an aal2 (MFA) session for every admin page. */
export function adminGate(isPlatformAdmin: boolean, aal: string): "not_found" | "mfa_required" | "ok" {
  if (!isPlatformAdmin) return "not_found";
  return aal === "aal2" ? "ok" : "mfa_required";
}
