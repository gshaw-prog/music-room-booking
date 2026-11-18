// Small crypto helpers. NOTE: in the static demo, password checks run in the
// browser, so they are for realism only — a real deployment must check
// passwords on a server (see README → "Going live").

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function randomSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0x811c9dc5; // FNV-1a fallback for non-secure contexts
  for (const b of data) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return 'fnv-' + h.toString(16);
}

const WORDS = ['piano', 'viola', 'tempo', 'chord', 'drums', 'flute', 'harp', 'lyric', 'opera', 'tenor', 'cello', 'banjo', 'forte', 'largo', 'scale', 'tuba'];
export function tempPassword() {
  const n = crypto.getRandomValues(new Uint32Array(2));
  return `${WORDS[n[0] % WORDS.length]}-${1000 + (n[1] % 9000)}`;
}
