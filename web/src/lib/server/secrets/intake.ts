import 'server-only';
import { compactDecrypt, importJWK, type JWK } from 'jose';
import { optionalEnv } from '../env';

/**
 * Secret intake crypto (security.md §2.2). The browser encrypts each field with
 * jose.CompactEncrypt(alg ECDH-ES+A256KW, enc A256GCM, kid) to our public key from
 * GET /api/intake/key. Payload: { org_id, step_id, field_id, value, iat, exp, nonce } (exp - iat <= 300 s).
 *
 * Keys: INTAKE_JWE_PRIVATE_JWK (current, P-256 JWK incl. "d" and "kid") and optionally
 * INTAKE_JWE_PRIVATE_JWK_PREVIOUS during rotation (two kids active, 180-day rotation).
 */

export type IntakePayload = { org_id: string; step_id: string; field_id: string; value: string; iat: number; exp: number; nonce: string };

function privateJwks(): JWK[] {
  const out: JWK[] = [];
  for (const name of ['INTAKE_JWE_PRIVATE_JWK', 'INTAKE_JWE_PRIVATE_JWK_PREVIOUS']) {
    const raw = optionalEnv(name);
    if (!raw) continue;
    try {
      const jwk = JSON.parse(raw) as JWK;
      if (jwk.kty === 'EC' && jwk.crv === 'P-256' && jwk.d && jwk.kid) out.push(jwk);
    } catch {
      /* ignore malformed key; reported as not configured */
    }
  }
  return out;
}

export function intakeConfigured(): boolean {
  return privateJwks().length > 0;
}

/** Public keys for the browser (private part stripped). */
export function publicJwks(): JWK[] {
  return privateJwks().map(({ kty, crv, x, y, kid }) => ({ kty, crv, x, y, kid, use: 'enc', alg: 'ECDH-ES+A256KW' }));
}

export class IntakeError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'IntakeError';
  }
}

const seenNonces = new Map<string, number>(); // per-instance replay guard (best effort)

export async function decryptIntake(jwe: string, expectedOrgId: string): Promise<IntakePayload> {
  if (typeof jwe !== 'string' || jwe.length > 80_000 || jwe.split('.').length !== 5) throw new IntakeError('malformed_jwe');
  const header = JSON.parse(Buffer.from(jwe.split('.')[0], 'base64url').toString('utf8')) as { kid?: string; alg?: string; enc?: string };
  const jwk = privateJwks().find((k) => k.kid === header.kid);
  if (!jwk) throw new IntakeError('unknown_kid');
  const key = await importJWK(jwk, 'ECDH-ES+A256KW');
  let plaintext: Uint8Array;
  try {
    ({ plaintext } = await compactDecrypt(jwe, key, { keyManagementAlgorithms: ['ECDH-ES+A256KW'], contentEncryptionAlgorithms: ['A256GCM'] }));
  } catch {
    throw new IntakeError('decrypt_failed');
  }
  let p: IntakePayload;
  try {
    p = JSON.parse(new TextDecoder().decode(plaintext)) as IntakePayload;
  } catch {
    throw new IntakeError('bad_payload');
  }
  const now = Math.floor(Date.now() / 1000);
  if (p.org_id !== expectedOrgId) throw new IntakeError('org_mismatch');
  if (typeof p.value !== 'string' || typeof p.step_id !== 'string' || typeof p.field_id !== 'string') throw new IntakeError('bad_payload');
  if (!Number.isFinite(p.exp) || !Number.isFinite(p.iat) || p.exp < now || p.exp - p.iat > 300 || p.iat > now + 60) throw new IntakeError('expired');
  if (typeof p.nonce !== 'string' || p.nonce.length < 16) throw new IntakeError('bad_nonce');
  for (const [n, exp] of seenNonces) if (exp < now) seenNonces.delete(n);
  if (seenNonces.has(p.nonce)) throw new IntakeError('replayed');
  seenNonces.set(p.nonce, p.exp);
  return p;
}
