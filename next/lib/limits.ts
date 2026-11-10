// Per-instance abuse protection. Hosting-level limits should also be enabled.
const buckets = new Map<string, { count: number; until: number }>();
export function allowRequest(key: string, limit: number): boolean {
  const now = Date.now();
  for (const [id, value] of buckets) if (value.until <= now) buckets.delete(id);
  const current = buckets.get(key);
  if (!current) {
    if (buckets.size >= 10000) return false;
    buckets.set(key, { count: 1, until: now + 60000 });
    return true;
  }
  return ++current.count <= limit;
}
