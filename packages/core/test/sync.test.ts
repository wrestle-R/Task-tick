import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apply,
  complete,
  createMutation,
  emptyState,
  reconcile,
  validatePatch,
} from "../src/index.ts";
test("acknowledgement does not discard mutations made during upload", () => {
  const first = createMutation("todo", { title: "first" });
  const second = createMutation("todo", { title: "second" });
  const state = apply(apply(emptyState(), first), second);
  const synced = reconcile(
    state,
    [{ ...state.items[0], title: "server" }],
    [first.id],
    1,
  );
  assert.deepEqual(
    synced.outbox.map((m) => m.id),
    [second.id],
  );
  assert.equal(synced.items.length, 2);
});
test("stale edit cannot resurrect a deleted item", () => {
  const create = createMutation("todo", { title: "task" });
  let s = apply(emptyState(), create);
  s = apply(s, createMutation("todo", {}, create.itemId, "delete"));
  s = apply(s, createMutation("todo", { title: "stale" }, create.itemId));
  assert.ok(s.items[0].deletedAt);
  assert.equal(s.items[0].title, "task");
});
test("parent completion is atomic in local state and preserves prior child state for Undo", () => {
  let s = apply(emptyState(), createMutation("todo", { title: "parent" }));
  const parent = s.items[0];
  s = apply(s, createMutation("todo", { title: "child", parentId: parent.id }));
  const result = complete(s, parent, true);
  assert.ok(result.state.items.every((i) => i.done));
  assert.ok(result.previous.every((i) => !i.done));
  assert.equal(result.mutations.length, 2);
});
test("input validation rejects untrusted fields and invalid ratings", () => {
  assert.throws(() => validatePatch({ rating: 6 }));
  assert.throws(() => validatePatch({ owner: "somebody" } as never));
  assert.doesNotThrow(() => validatePatch({ rating: 4.5 }));
});

test("late acknowledgement removes its overlay without replacing newer server state", () => {
  const mutation = createMutation("todo", { title: "local old edit" });
  const local = apply(emptyState(), mutation);
  const newer = { ...local.items[0], title: "newer server edit" };
  const first = reconcile(local, [newer], [], 20);
  assert.equal(first.items[0].title, "local old edit");
  const late = reconcile(first, local.items, [mutation.id], 10);
  assert.equal(late.cursor, 20);
  assert.equal(late.items[0].title, "newer server edit");
  assert.equal(late.outbox.length, 0);
});
test("confirmed state survives persistence and preserves edits still awaiting acknowledgement", () => {
  const first = createMutation("todo", { title: "task" });
  const local = apply(emptyState(), first);
  const accepted = reconcile(local, local.items, [first.id], 1);
  const later = createMutation("todo", { notes: "new local notes" }, first.itemId);
  const persisted = JSON.parse(JSON.stringify(apply(accepted, later)));
  const result = reconcile(persisted, [{ ...accepted.items[0], title: "server title" }], [], 2);
  assert.equal(result.items[0].title, "server title");
  assert.equal(result.items[0].notes, "new local notes");
  assert.deepEqual(result.outbox.map(m => m.id), [later.id]);
});
