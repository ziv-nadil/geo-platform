import 'server-only';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

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

const FORBIDDEN_ELEMENTS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'link', 'meta', 'base', 'handler', 'listener']);
const SAFE_DATA_URI = /^data:image\/(png|jpeg|gif|webp);/i;
const decodeForScheme = (v: string) => v.replace(/[\u0000-\u0020\u007f-\u009f]+/g, '').toLowerCase();

function cssIsSafe(css: string): boolean {
  const c = css.toLowerCase().replace(/\\/g, '');
  if (/@import|expression\(|javascript:|behavior\s*:|-moz-binding/.test(c)) return false;
  return !/url\(\s*["']?\s*(?!#)/.test(c);
}

/**
 * SVG screen on a real XML parse (not regexes): must be well-formed XML with an <svg> root, no DOCTYPE/ENTITY,
 * no script/foreignObject/iframe/object/embed (any namespace prefix), no on* attributes, no animation (<set>/<animate*>)
 * targeting href or on*, and links only to same-document fragments or inline raster data URIs. Entities are decoded
 * before checking, so `&#106;avascript:` is caught. Anything that fails to parse is rejected.
 */
export function svgIsSafe(bytes: Uint8Array): boolean {
  const src = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '');
  if (/<!doctype|<!entity/i.test(src)) return false;
  if (XMLValidator.validate(src) !== true) return false;
  let doc: Record<string, unknown>[];
  try {
    doc = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: true, htmlEntities: true, trimValues: false, parseTagValue: false, parseAttributeValue: false }).parse(src);
  } catch {
    return false;
  }
  const local = (n: string) => n.slice(n.indexOf(':') + 1).toLowerCase();
  let sawSvgRoot = false;
  const walk = (nodes: Record<string, unknown>[], depth: number): boolean => {
    if (depth > 64) return false;
    for (const node of nodes) {
      for (const [key, val] of Object.entries(node)) {
        if (key === ':@') {
          const attrs = val as Record<string, string>;
          const tag = Object.keys(node).find((k) => k !== ':@') ?? '';
          const animates = /^(set|animate|animatetransform|animatemotion)$/.test(local(tag));
          for (const [rawName, rawVal] of Object.entries(attrs)) {
            const name = local(rawName.replace(/^@_/, ''));
            const value = String(rawVal);
            if (name.startsWith('on')) return false;
            const compact = decodeForScheme(value);
            if (compact.includes('javascript:') || compact.startsWith('vbscript:') || (compact.startsWith('data:') && !SAFE_DATA_URI.test(compact))) return false;
            if (name === 'href' || name === 'src') {
              if (!(value.trim().startsWith('#') || SAFE_DATA_URI.test(compact))) return false;
            }
            if (animates && (name === 'attributename' || name === 'to' || name === 'values' || name === 'from' || name === 'by')) {
              if (name === 'attributename' && /^(href|on)/.test(local(value))) return false;
            }
            if (name === 'style' && !cssIsSafe(value)) return false;
          }
        } else if (key.startsWith('#')) {
          continue;
        } else {
          const lk = local(key);
          if (FORBIDDEN_ELEMENTS.has(lk)) return false;
          if (depth === 0 && key !== '?xml') {
            if (lk !== 'svg') return false;
            sawSvgRoot = true;
          }
          const kids = val as Record<string, unknown>[];
          if (lk === 'style') {
            const css = kids.map((k) => String(k['#text'] ?? k['#cdata'] ?? '')).join('');
            if (!cssIsSafe(css)) return false;
          }
          if (!walk(kids, depth + 1)) return false;
        }
      }
    }
    return true;
  };
  return walk(doc, 0) && sawSvgRoot;
}
