import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apply,
  compareItems,
  planMove,
  visible,
  collectSyncPages,
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

test("paged sync drains mutation batches and independent item/history pages", async () => {
  const mutations=Array.from({length:101},(_,i)=>createMutation("todo",{title:`Task ${i}`}));
  const item=apply(emptyState(),mutations[0]).items[0];
  const history=[{id:"h1",item,at:new Date().toISOString()},{id:"h2",item,at:new Date().toISOString()}];
  const requests: Parameters<Parameters<typeof collectSyncPages>[0]>[0][]=[];
  const result=await collectSyncPages(async request=>{
    requests.push(request);
    if(requests.length===1)return {items:[item],accepted:request.mutations.map(m=>m.id),cursor:1,history:[history[0]],hasMore:true,pullUntil:2,historyHasMore:true,historyAfter:1,historyUntil:2};
    if(requests.length===2)return {items:[],accepted:[],cursor:2,history:[history[1]],hasMore:false,pullUntil:2,historyHasMore:false,historyAfter:2,historyUntil:2};
    return {items:[],accepted:request.mutations.map(m=>m.id),cursor:3,history:[],historyAfter:2};
  },mutations,0);
  assert.deepEqual(requests.map(r=>r.mutations.length),[100,0,1]);
  assert.equal(requests[1].pullUntil,2);assert.equal(requests[1].historyUntil,2);
  assert.equal(requests[2].pullUntil,undefined);assert.equal(requests[2].historyUntil,undefined);
  assert.equal(result.accepted.length,101);assert.equal(result.history.length,2);assert.equal(result.cursor,3);
});
test("failed or nonadvancing sync pages preserve the caller's durable queue", async () => {
  const mutation=createMutation("todo",{title:"Keep me"});const state=apply(emptyState(),mutation);const before=JSON.stringify(state);
  let calls=0;
  await assert.rejects(collectSyncPages(async request=>{
    if(++calls===2)throw Error("Network response lost");
    return {items:[],accepted:[mutation.id],cursor:1,history:[],hasMore:true,pullUntil:2};
  },state.outbox,0),/Network response lost/);
  assert.equal(JSON.stringify(state),before);
  await assert.rejects(collectSyncPages(async()=>({items:[],accepted:[],cursor:0,history:[],hasMore:true}),[],0),/did not advance/);
});

test("completed mutation batches checkpoint before a later network failure", async () => {
  const mutations=Array.from({length:101},(_,i)=>createMutation("todo",{title:`Task ${i}`}));
  let durable=mutations.reduce((s,m)=>apply(s,m),emptyState());let calls=0;
  await assert.rejects(collectSyncPages(async request=>{
    if(++calls===2)throw Error("Network interrupted");
    return {items:durable.items.slice(0,100),accepted:request.mutations.map(m=>m.id),cursor:100,history:[]};
  },mutations,0,async page=>{durable=reconcile(durable,page.items,page.accepted,page.cursor);}),/Network interrupted/);
  assert.equal(durable.cursor,100);assert.deepEqual(durable.outbox.map(m=>m.id),[mutations[100].id]);
  assert.equal(durable.items.length,101);
});

test("equal ranks converge independently of response and insertion order", () => {
  let state = emptyState();
  for (const id of ["00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"])
    state = apply(state, createMutation("todo", {title: id, position: 1}, id));
  const expected = state.items.map(i => i.id).sort();
  assert.deepEqual(visible(state, "todo").map(i => i.id), expected);
  assert.deepEqual(visible({...state, items: [...state.items].reverse()}, "todo").map(i => i.id), expected);
});
test("moves exclude the dragged row from its destination neighbours", () => {
  let state = emptyState();
  for (const rank of [100, 200, 300, 400]) state = apply(state, createMutation("todo", {title: String(rank), position: rank}));
  const [a,b,c,d] = state.items;
  const move = planMove(state.items, a.id, c.id);
  assert.equal(move.length, 1);
  assert.equal(move[0].position, 250);
  const moved = apply(state, createMutation("todo", {position: move[0].position}, a.id));
  assert.deepEqual(visible(moved, "todo").map(i => i.id), [b.id,a.id,c.id,d.id]);
  assert.deepEqual(planMove(state.items, a.id, b.id), []);
});
test("exhausted rank spacing rebalances without removing concurrent inserts or edits", () => {
  let state = emptyState();
  for (const [title, position] of [["a",1],["b",1+Number.EPSILON],["c",2]] as const)
    state = apply(state, createMutation("todo", {title,position}));
  const [a,b,c] = state.items;
  const moves = planMove(state.items, c.id, b.id);
  assert.equal(moves.length, 3);
  const added = createMutation("todo", {title:"concurrent",position:1});
  state = apply(state, added);
  state = apply(state, createMutation("todo", {notes:"independent edit"}, a.id));
  for (const move of moves) state = apply(state, createMutation("todo", {position:move.position}, move.itemId));
  assert.deepEqual(visible(state,"todo").map(i=>i.title), ["concurrent","a","c","b"]);
  assert.equal(state.items.find(i=>i.id===a.id)?.notes,"independent edit");
  assert.deepEqual([...state.items].reverse().sort(compareItems).map(i=>i.id), visible(state,"todo").map(i=>i.id));
});
