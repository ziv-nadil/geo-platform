import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { sniffUpload, svgIsSafe } from '@/lib/server/uploads';

const enc = (s: string) => new TextEncoder().encode(s);

describe('upload validation', () => {
  it('sniffs by magic bytes, ignoring names', () => {
    expect(sniffUpload(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toMatchObject({ ok: true, mime: 'image/png' });
    expect(sniffUpload(enc('<!DOCTYPE html><html></html>'))).toMatchObject({ ok: true, kind: 'html' });
    expect(sniffUpload(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toEqual({ ok: false, error: 'zip_not_supported' });
    expect(sniffUpload(enc('MZ binary'))).toMatchObject({ ok: false });
  });
  it('rejects active SVG', () => {
    expect(svgIsSafe(enc('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'))).toBe(true);
    expect(svgIsSafe(enc('<svg><script>alert(1)</script></svg>'))).toBe(false);
    expect(svgIsSafe(enc('<svg onload="x()"></svg>'))).toBe(false);
    expect(svgIsSafe(enc('<svg><image href="https://evil/x.png"/></svg>'))).toBe(false);
  });
});
