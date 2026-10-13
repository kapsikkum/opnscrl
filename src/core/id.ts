const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Short random id, e.g. `lyr_k3j9x0a2b7qz`. Uses Web Crypto when available. */
export function createId(prefix = ''): string {
  const bytes = new Uint8Array(12);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}_${out}` : out;
}
