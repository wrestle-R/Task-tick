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
