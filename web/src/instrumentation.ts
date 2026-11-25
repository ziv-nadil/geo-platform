export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { registerBackendBroker } = await import('@/lib/server/secrets/engine-broker');
  registerBackendBroker();
}
