import 'server-only';

/**
 * Server-side upload validation (security.md §6.3): size caps and magic-byte sniffing, never the
 * client-supplied MIME or extension. SVG is accepted only when it carries no active content; zip is rejected.
 */
export type UploadKind = 'image' | 'html';
export type Sniffed = { ok: true; mime: string; ext: string; kind: UploadKind } | { ok: false; error: string };

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_HTML_BYTES = 2 * 1024 * 1024;

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

export function sniffUpload(bytes: Uint8Array): Sniffed {
  if (bytes.length === 0) return { ok: false, error: 'empty_file' };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ok: true, mime: 'image/png', ext: 'png', kind: 'image' };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { ok: true, mime: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return { ok: true, mime: 'image/gif', ext: 'gif', kind: 'image' };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { ok: true, mime: 'image/webp', ext: 'webp', kind: 'image' };
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return { ok: true, mime: 'image/x-icon', ext: 'ico', kind: 'image' };
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) return { ok: false, error: 'zip_not_supported' };

  // Text formats: decode a bounded prefix.
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, 4096))).replace(/^﻿/, '').trimStart().toLowerCase();
  if (text.startsWith('<svg') || (text.startsWith('<?xml') && text.includes('<svg'))) return { ok: true, mime: 'image/svg+xml', ext: 'svg', kind: 'image' };
  if (text.startsWith('<!doctype html') || text.startsWith('<html') || text.includes('<head') || text.includes('<body')) return { ok: true, mime: 'text/html', ext: 'html', kind: 'html' };
  return { ok: false, error: 'unsupported_file_type' };
}

/** Conservative SVG screen: reject anything that can execute or load external resources. */
export function svgIsSafe(bytes: Uint8Array): boolean {
  const s = new TextDecoder().decode(bytes).toLowerCase();
  if (/<script|<foreignobject|<iframe|<object|<embed|<!entity|<!doctype[^>]*\[/.test(s)) return false;
  if (/\son[a-z]+\s*=/.test(s)) return false;
  if (/(href|src)\s*=\s*["']?\s*(?!#|data:image\/(png|jpeg|gif|webp);)[^"'\s>]/.test(s)) return false;
  if (/url\(\s*["']?\s*(?!#)/.test(s) || /@import|javascript:/.test(s)) return false;
  return true;
}
