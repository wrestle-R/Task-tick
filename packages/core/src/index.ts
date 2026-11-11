export type Kind = "todo" | "movie";
export type Fields = {
  title: string;
  done: boolean;
  notes: string;
  priority: number;
  dueAt: string | null;
  parentId: string | null;
  position: number;
  rating: number | null;
  mediaType: "movie" | "tv" | null;
  tmdbId: number | null;
  poster: string | null;
};
export type Item = Fields & {
  id: string;
  kind: Kind;
  deletedAt: string | null;
  updatedAt: string;
};
export type Mutation = {
  id: string;
  itemId: string;
  kind: Kind;
  action: "patch" | "delete" | "restore";
  patch: Partial<Fields>;
};
export type HistoryEntry = { id: string; item: Item; at: string };
export type State = {
  items: Item[];
  outbox: Mutation[];
  history: HistoryEntry[];
  cursor: number;
  confirmedItems?: Item[];
};
export const emptyState = (): State => ({
  items: [],
  outbox: [],
  history: [],
  cursor: 0,
  confirmedItems: [],
});
export const newId = (): string =>
  (
    globalThis as unknown as { crypto: { randomUUID(): string } }
  ).crypto.randomUUID();
export const defaults = (): Fields => ({
  title: "",
  done: false,
  notes: "",
  priority: 0,
  dueAt: null,
  parentId: null,
  position: Date.now(),
  rating: null,
  mediaType: null,
  tmdbId: null,
  poster: null,
});
export function validatePatch(patch: Partial<Fields>): void {
  const allowed = new Set(Object.keys(defaults()));
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.has(k)) throw new Error(`Unsupported field: ${k}`);
    if (
      (k === "title" || k === "notes") &&
      (typeof v !== "string" || v.length > (k === "title" ? 500 : 20000))
    )
      throw new Error(`Invalid ${k}`);
    if (k === "title" && !(v as string).trim())
      throw new Error("A title is required");
    if (k === "done" && typeof v !== "boolean")
      throw new Error("Invalid completion");
    if (
      k === "priority" &&
      (!Number.isInteger(v) || Number(v) < 0 || Number(v) > 3)
    )
      throw new Error("Invalid priority");
    if (k === "position" && (typeof v !== "number" || !Number.isFinite(v)))
      throw new Error("Invalid order");
    if (
      k === "rating" &&
      v !== null &&
      (typeof v !== "number" || v < 1 || v > 5 || (v * 2) % 1 !== 0)
    )
      throw new Error("Rating must be 1–5 in half-star steps");
    if (k === "mediaType" && v !== null && v !== "movie" && v !== "tv")
      throw new Error("Invalid media type");
    if (
      k === "tmdbId" &&
      v !== null &&
      (!Number.isSafeInteger(v) || Number(v) <= 0)
    )
      throw new Error("Invalid TMDB ID");
    if (
      k === "parentId" &&
      v !== null &&
      (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v))
    )
      throw new Error("Invalid parent");
    if (
      k === "dueAt" &&
      v !== null &&
      (typeof v !== "string" || !Number.isFinite(Date.parse(v)))
    )
      throw new Error("Invalid due date");
    if (
      k === "poster" &&
      v !== null &&
      (typeof v !== "string" || !/^\/[a-zA-Z0-9._-]+$/.test(v))
    )
      throw new Error("Invalid poster");
  }
}
export function apply(
  state: State,
  mutation: Mutation,
  now = new Date().toISOString(),
): State {
  validatePatch(mutation.patch);
  const old = state.items.find((i) => i.id === mutation.itemId);
  if (!old && mutation.action !== "patch") return state;
  if (old?.deletedAt && mutation.action === "patch") return state;
  const item: Item = {
    ...defaults(),
    ...old,
    ...mutation.patch,
    id: mutation.itemId,
    kind: mutation.kind,
    updatedAt: now,
    deletedAt:
      mutation.action === "delete"
        ? now
        : mutation.action === "restore"
          ? null
          : (old?.deletedAt ?? null),
  };
  return {
    ...state,
    items: [...state.items.filter((i) => i.id !== item.id), item],
    history: old
      ? [
          ...state.history.filter(
            (h) => Date.parse(h.at) > Date.parse(now) - 7 * 86400000,
          ),
          { id: mutation.id, item: old, at: now },
        ]
      : state.history,
    outbox: state.outbox.some((m) => m.id === mutation.id)
      ? state.outbox
      : [...state.outbox, mutation],
  };
}
export function createMutation(
  kind: Kind,
  patch: Partial<Fields>,
  itemId = newId(),
  action: Mutation["action"] = "patch",
): Mutation {
  validatePatch(patch);
  return { id: newId(), itemId, kind, action, patch };
}
export function complete(
  state: State,
  item: Item,
  done: boolean,
): { state: State; mutations: Mutation[]; previous: Item[] } {
  const children = done
    ? state.items.filter(
        (i) => i.parentId === item.id && !i.deletedAt && !i.done,
      )
    : [];
  const previous = [item, ...children];
  const mutations = previous.map((i) => createMutation(i.kind, { done }, i.id));
  return { state: mutations.reduce(applyReducer, state), mutations, previous };
}
function applyReducer(s: State, m: Mutation) {
  return apply(s, m);
}
export function reconcile(
  state: State,
  serverItems: Item[],
  accepted: string[],
  cursor: number,
): State {
  const outbox = state.outbox.filter((m) => !accepted.includes(m.id));
  const confirmed = new Map((state.confirmedItems ?? state.items).map((i) => [i.id, i]));
  // An older acknowledgement may remove queued work, but cannot replace newer server data.
  if (cursor >= state.cursor) {
    for (const item of serverItems) confirmed.set(item.id, item);
  }
  let next: State = {
    ...state,
    items: [...confirmed.values()],
    confirmedItems: [...confirmed.values()],
    outbox: [],
    cursor: Math.max(state.cursor, cursor),
  };
  for (const pending of outbox) next = apply(next, pending);
  return { ...next, outbox };

}
// Order v1: numeric rank, then UUID bytes (never locale-dependent).
export function compareItems(a: Pick<Item, "position" | "id">, b: Pick<Item, "position" | "id">): number {
  return a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
export function planMove(items: Item[], movedId: string, beforeId: string | null): { itemId: string; position: number }[] {
  const ordered = [...items].sort(compareItems);
  const moved = ordered.find(i => i.id === movedId);
  if (!moved || movedId === beforeId) return [];
  const remaining = ordered.filter(i => i.id !== movedId);
  const target = beforeId === null ? remaining.length : remaining.findIndex(i => i.id === beforeId);
  if (target < 0) return [];
  remaining.splice(target, 0, moved);
  if (remaining.every((i, n) => i.id === ordered[n].id)) return [];
  const left = remaining[target - 1]?.position, right = remaining[target + 1]?.position;
  const rank = left === undefined ? (right ?? 0) - 1024
    : right === undefined ? left + 1024 : left / 2 + right / 2;
  if (Number.isFinite(rank) && (left === undefined || rank > left) && (right === undefined || rank < right))
    return [{ itemId: movedId, position: rank }];
  // Exhausted/equal ranks: rewrite only this visible list, in one local transaction.
  // Concurrent/new items are never replaced by an authoritative array of IDs.
  return remaining.flatMap((item, n) => item.position === (n + 1) * 1024 ? [] : [{ itemId: item.id, position: (n + 1) * 1024 }]);
}

export function visible(
  state: State,
  kind: Kind,
  view: "active" | "done" | "trash" = "active",
) {
  return state.items
    .filter(
      (i) =>
        i.kind === kind &&
        (view === "trash"
          ? !!i.deletedAt && Date.parse(i.deletedAt) > Date.now() - 7 * 86400000
          : !i.deletedAt && i.done === (view === "done")),
    )
    .sort(compareItems);
}
export function duplicate(
  items: Item[],
  mediaType: "movie" | "tv",
  tmdbId: number,
) {
  return items.find(
    (i) =>
      !i.deletedAt &&
      i.kind === "movie" &&
      i.mediaType === mediaType &&
      i.tmdbId === tmdbId,
  );
}

export type SyncPageRequest = { protocol: 2; mutations: Mutation[]; cursor: number; pullUntil?: number; historyAfter: number; historyUntil?: number };
export type SyncPage = { items: Item[]; accepted: string[]; cursor: number; history: HistoryEntry[]; hasMore?: boolean; pullUntil?: number; historyHasMore?: boolean; historyAfter?: number; historyUntil?: number };
export async function collectSyncPages(send: (request: SyncPageRequest) => Promise<SyncPage>, mutations: Mutation[], cursor: number, checkpoint?: (result: SyncPage) => Promise<void>): Promise<SyncPage> {
  const items = new Map<string, Item>(), history = new Map<string, HistoryEntry>(), accepted = new Set<string>();
  let requests = 0, historyAfter = 0;
  for (let offset = 0; offset < Math.max(1, mutations.length); offset += 100) {
    let batch = mutations.slice(offset, offset + 100), pullUntil: number | undefined, historyUntil: number | undefined;
    let more: boolean;
    do {
      if (++requests > 1000) throw new Error("Sync is large; retry to continue. Your edits remain saved.");
      const page = await send({ protocol: 2, mutations: batch, cursor, pullUntil, historyAfter, historyUntil });
      if (page.cursor < cursor || (page.hasMore && page.cursor === cursor) || (page.historyHasMore && (page.historyAfter ?? 0) <= historyAfter)) throw new Error("Sync did not advance; your edits remain saved.");
      if (batch.some(m => !page.accepted.includes(m.id))) throw new Error("Missing mutation acknowledgement; retry safely.");
      for (const item of page.items) items.set(item.id, item);
      for (const entry of page.history) history.set(entry.id, entry);
      for (const id of page.accepted) accepted.add(id);
      cursor = page.cursor; pullUntil = page.pullUntil;
      historyAfter = page.historyAfter ?? historyAfter; historyUntil = page.historyUntil;
      batch = []; more = !!(page.hasMore || page.historyHasMore);
    } while (more);
    await checkpoint?.({ items: [...items.values()], history: [...history.values()], accepted: [...accepted], cursor });
  }
  return { items: [...items.values()], history: [...history.values()], accepted: [...accepted], cursor };
}
