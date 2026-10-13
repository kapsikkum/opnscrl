/**
 * Template serialization:
 *  - file: pretty JSON, extension `.opnscrl.json`
 *  - link: lz-string `compressToEncodedURIComponent` of the compact JSON in the URL hash, `#t=...`
 * Both decoders parse, run core migrations, then validate with zod, so
 * anything that comes in from a file or a link is checked before use.
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { migrateDocument, type RawDoc } from '../core/migrations';
import { templateSchema, type Template } from './schema';

export const TEMPLATE_FILE_EXTENSION = '.opnscrl.json';
export const TEMPLATE_MIME = 'application/json';
export const SHARE_PARAM = 't';
/** Above this many characters, links get unwieldy (chat apps truncate); suggest sharing a file instead. */
export const SHARE_LINK_WARN_LENGTH = 8000;
/** Refuse to parse absurd inputs. */
export const MAX_TEMPLATE_FILE_BYTES = 40 * 1024 * 1024;

export class TemplateParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateParseError';
  }
}

/** Parse + migrate + validate an untrusted value. */
export function validateTemplate(value: unknown): Template {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TemplateParseError('Template must be a JSON object');
  }
  let migrated: RawDoc;
  try {
    migrated = migrateDocument(value as RawDoc);
  } catch (e) {
    throw new TemplateParseError((e as Error).message);
  }
  const r = templateSchema.safeParse(migrated);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new TemplateParseError(`Invalid template at ${first?.path.join('.') || '(root)'}: ${first?.message ?? 'unknown error'}`);
  }
  return r.data;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new TemplateParseError(`Not valid JSON: ${(e as Error).message}`);
  }
}

export function encodeTemplateFile(template: Template): string {
  return JSON.stringify(templateSchema.parse(template), null, 2);
}

export function decodeTemplateFile(text: string): Template {
  if (typeof text !== 'string') throw new TemplateParseError('Template file must be text');
  if (text.length > MAX_TEMPLATE_FILE_BYTES) throw new TemplateParseError('Template file is too large');
  return validateTemplate(parseJson(text));
}

export function templateFileName(template: Pick<Template, 'name'>): string {
  const slug = template.name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
  return `${slug || 'template'}${TEMPLATE_FILE_EXTENSION}`;
}

export interface ShareLink {
  url: string;
  /** Length of the whole URL in characters. */
  length: number;
  /** True when the link is long enough that sharing the file is the better option. */
  tooLong: boolean;
}

/** Just the hash payload, without the base URL. */
export function encodeTemplatePayload(template: Template): string {
  return compressToEncodedURIComponent(JSON.stringify(templateSchema.parse(template)));
}

/** Build a share link. `base` is the app URL without hash (defaults to the current page). */
export function encodeShareLink(template: Template, base?: string): ShareLink {
  const origin =
    base ?? (typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : 'https://opnscrl.invalid/');
  const url = `${origin.split('#')[0]}#${SHARE_PARAM}=${encodeTemplatePayload(template)}`;
  return { url, length: url.length, tooLong: url.length > SHARE_LINK_WARN_LENGTH };
}

/**
 * Read a template out of a full URL or a `#t=...` hash. Returns null when the
 * input carries no template; throws TemplateParseError when it does but the
 * payload is corrupt or invalid. (Parsed by hand: lz-string's alphabet
 * contains '+', which URLSearchParams would turn into a space.)
 */
export function decodeShareLink(input: string): Template | null {
  const hashIndex = input.indexOf('#');
  const fragment = hashIndex >= 0 ? input.slice(hashIndex + 1) : input;
  const prefix = `${SHARE_PARAM}=`;
  const start = fragment.startsWith(prefix) ? 0 : fragment.indexOf(`&${prefix}`) + 1 || -1;
  if (start < 0) return null;
  const payload = fragment.slice(start + prefix.length).split('&')[0] ?? '';
  if (!payload) return null;
  let json: string | null;
  try {
    json = decompressFromEncodedURIComponent(payload);
  } catch {
    json = null;
  }
  if (!json) throw new TemplateParseError('The link is damaged or incomplete');
  if (json.length > MAX_TEMPLATE_FILE_BYTES) throw new TemplateParseError('Template is too large');
  return validateTemplate(parseJson(json));
}
