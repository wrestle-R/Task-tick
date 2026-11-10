import fs from 'node:fs';
import pg from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const file = process.env.TICK_TEST_DATABASE_ENV_FILE;
if (!file) throw Error('Set TICK_TEST_DATABASE_ENV_FILE to the authorized test database environment file.');
const connectionString = fs.readFileSync(file, 'utf8').match(/^DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '');
const db = new pg.Client({ connectionString, connectionTimeoutMillis: 15000 });
await db.connect();
try {
  await db.query('begin');
  const a = randomUUID(), b = randomUUID(), id = randomUUID();
  for (const user of [a,b]) await db.query("insert into auth.users(id,aud,role,email) values($1,'authenticated','authenticated',$2)", [user, `tick-protocol-${user}@example.invalid`]);
  async function as(user) {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    await db.query('set local role authenticated');
  }
  async function sync(mutations, cursor = 0) {
    return (await db.query('select public.tick_sync($1::jsonb,$2::bigint) as result', [JSON.stringify(mutations),cursor])).rows[0].result;
  }
  const mutation = (patch, action = 'patch') => ({id:randomUUID(), itemId:id,kind:'todo',action,patch});
  await as(a);
  const initial = mutation({title:'Original'});
  const first = await sync([initial]);
  const replay = await sync([initial]);
  assert.equal(replay.cursor,first.cursor,'Lost-response retry must not write twice');
  assert.equal(replay.history.length,first.history.length);
  await sync([mutation({notes:'Offline notes'})]);
  const merged = await sync([mutation({title:'Later accepted title'})]);
  assert.equal(merged.items[0].notes,'Offline notes','Different fields must merge');
  assert.equal(merged.items[0].title,'Later accepted title');
  const conflict = await sync([mutation({title:'Last server acceptance'})]);
  assert.equal(conflict.items[0].title,'Last server acceptance');
  assert.ok(conflict.history.some(h => h.item.title === 'Later accepted title'));
  await sync([mutation({},'delete')]);
  const stale = await sync([mutation({title:'Stale offline edit'})]);
  assert.ok(stale.items[0].deletedAt,'Stale edit cannot resurrect deletion');
  assert.ok(stale.history.some(h => h.item.title === 'Stale offline edit'));
  await as(b);
  assert.deepEqual((await sync([])).items,[],'Another account must not receive data');
  assert.equal((await db.query('select * from public."code-todo"')).rowCount,0,'RLS must isolate direct reads');
  await as(a);
  assert.equal((await sync([mutation({},'restore')])).items[0].deletedAt,null);
  await db.query('savepoint invalid_replay');
  await assert.rejects(sync([{...initial,patch:{title:'Changed payload'}}]), /Mutation ID reused/);
  await db.query('rollback to savepoint invalid_replay');
  console.log('PASS: replay/lost response, field merges, server-order conflicts/history, deletion/stale recovery, restore, RLS/account isolation, mutation ID integrity.');
} finally {
  await db.query('rollback');
  await db.end();
  console.log('Rolled back all protocol test data.');
}
