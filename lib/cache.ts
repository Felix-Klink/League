// Einfacher In-Memory-Cache mit TTL.
// Reicht für privaten Gebrauch; später ersetzbar durch Redis/Vercel KV.

interface Entry<T> {
  value: T;
  expires: number;
}

const store = new Map<string, Entry<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) {
    return hit.value;
  }
  const value = await fn();
  store.set(key, { value, expires: now + ttlMs });
  return value;
}

export const HOUR = 60 * 60 * 1000;
