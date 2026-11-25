import { connection } from 'next/server';
import { json, notConfiguredResponse } from '@/lib/server/auth';
import { publicJwks } from '@/lib/server/secrets/intake';

/** Public JWE keys for secret intake (security.md §2.2). Cacheable for 1 h. */
export async function GET() {
  await connection(); // read keys at request time, never bake them into the build
  const keys = publicJwks();
  if (!keys.length) return notConfiguredResponse(['INTAKE_JWE_PRIVATE_JWK']);
  return json({ keys, alg: 'ECDH-ES+A256KW', enc: 'A256GCM', maxAgeSeconds: 300 }, 200, { 'Cache-Control': 'public, max-age=3600' });
}
