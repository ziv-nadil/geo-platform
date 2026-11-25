import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { createServer } from 'node:http';
import { fetch as ufetch } from 'undici';
import { isPrivateAddress, pinnedAgent, safeFetch, SafeFetchError } from '../net/safe-fetch';

describe('isPrivateAddress', () => {
  it('blocks IPv4-compatible IPv6, 6to4, mapped and classic private ranges', () => {
    for (const ip of ['::7f00:1', '::127.0.0.1', '::10.0.0.1', '2002:7f00:1::1', '2002:a9fe:a9fe::', '::ffff:10.0.0.1', '10.1.2.3', '169.254.169.254', '::1', 'fd00::1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe('safeFetch', () => {
  it('refuses private IP literals and localhost before connecting', async () => {
    await expect(safeFetch('https://169.254.169.254/latest', { integration: 'scrape' })).rejects.toMatchObject({ code: 'private_address' });
    await expect(safeFetch('https://localhost/x', { integration: 'scrape' })).rejects.toBeInstanceOf(SafeFetchError);
  });
});

describe('DNS pinning', () => {
  it('connects to the validated address regardless of what the hostname would resolve to later', async () => {
    const srv = createServer((_q, r) => r.end('pinned'));
    await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
    const port = (srv.address() as { port: number }).port;
    const agent = pinnedAgent({ address: '127.0.0.1', family: 4 });
    try {
      // "rebind.invalid" does not resolve; only the pin makes this reachable.
      const res = await ufetch(`http://rebind.invalid:${port}/`, { dispatcher: agent });
      expect(await res.text()).toBe('pinned');
    } finally {
      await agent.close();
      srv.close();
    }
  });
});
