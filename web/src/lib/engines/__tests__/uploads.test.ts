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
  it('uses a real XML parse: entity-encoded schemes, animation on href, namespaced script, malformed XML', () => {
    const wrap = (inner: string) => enc(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${inner}</svg>`);
    expect(svgIsSafe(wrap('<a><set attributeName="href" to="&#106;avascript:alert(1)"/></a>'))).toBe(false);
    expect(svgIsSafe(wrap('<a href="&#106;avascript:alert(1)"><text>x</text></a>'))).toBe(false);
    expect(svgIsSafe(wrap('<a xlink:href=" java&#x09;script:alert(1)"><text>x</text></a>'))).toBe(false);
    expect(svgIsSafe(wrap('<animate attributeName="xlink:href" values="javascript:alert(1)"/>'))).toBe(false);
    expect(svgIsSafe(wrap('<svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script>'))).toBe(false);
    expect(svgIsSafe(wrap('<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"/></foreignObject>'))).toBe(false);
    expect(svgIsSafe(wrap('<rect ONCLICK="x()"/>'))).toBe(false);
    expect(svgIsSafe(wrap('<style>@import url(https://evil/x.css);</style>'))).toBe(false);
    expect(svgIsSafe(wrap('<rect style="fill:url(https://evil/x)"/>'))).toBe(false);
    expect(svgIsSafe(wrap('<rect><unclosed></rect>'))).toBe(false);
    expect(svgIsSafe(enc('<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>'))).toBe(false);
    expect(svgIsSafe(enc('<html><svg xmlns="http://www.w3.org/2000/svg"/></html>'))).toBe(false);
  });
  it('accepts a plain logo SVG', () => {
    expect(svgIsSafe(enc('<?xml version="1.0"?><!-- logo --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><use href="#g"/><rect style="fill:url(#g)" width="5" height="5"/><text>Hi &amp; bye</text></svg>'))).toBe(true);
  });
});
