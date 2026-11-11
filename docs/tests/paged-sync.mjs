import fs from 'node:fs';
import pg from 'pg';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
if(!process.env.TICK_TEST_DATABASE_ENV_FILE)throw Error('Set authorized database environment file');
const connectionString=fs.readFileSync(process.env.TICK_TEST_DATABASE_ENV_FILE,'utf8').match(/^DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g,'');
const db=new pg.Client({connectionString,connectionTimeoutMillis:15000});await db.connect();
try {
 await db.query('begin');
 const migration=fs.readFileSync('supabase/migrations/20261111063000_tick_paged_sync.sql','utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,'').replace('add column revision','add column if not exists revision').replace('create index tick_history_revision','create index if not exists tick_history_revision').replaceAll('create function ','create or replace function ');
 await db.query(migration);
 const owner=randomUUID(),other=randomUUID();
 for(const id of [owner,other])await db.query("insert into auth.users(id,aud,role,email) values($1,'authenticated','authenticated',$2)",[id,`tick-pages-${id}@example.invalid`]);
 async function as(id){await db.query('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);await db.query('set local role authenticated');}
 async function sync(mutations=[],cursor=0,pullUntil=null,historyAfter=0,historyUntil=null){return(await db.query('select public.tick_sync_v2($1::jsonb,$2::bigint,$3::bigint,$4::bigint,$5::bigint) as value',[JSON.stringify(mutations),cursor,pullUntil,historyAfter,historyUntil])).rows[0].value;}
 await as(owner);
 const mutations=Array.from({length:600},(_,i)=>({id:randomUUID(),itemId:randomUUID(),kind:i%2?'movie':'todo',action:'patch',patch:{title:`Page task ${i}`}}));
 for(let offset=0;offset<mutations.length;offset+=100)await sync(mutations.slice(offset,offset+100));
 for(let offset=0;offset<400;offset+=100)await sync(mutations.slice(offset,offset+100).map(m=>({...m,id:randomUUID(),patch:{title:'Updated '+m.patch.title}})));
 await sync(mutations.slice(0,100)); // Lost-response replay cannot create another history row.
 const items=new Map(),history=new Map();let cursor=0,pullUntil=null,historyAfter=0,historyUntil=null,pages=0,more;
 do{
  const result=await sync([],cursor,pullUntil,historyAfter,historyUntil);pages++;
  assert.ok(result.items.length<=250);assert.ok(result.history.length<=250);
  assert.ok(result.cursor>=cursor);assert.ok(result.historyAfter>=historyAfter);
  for(const item of result.items)items.set(item.id,item);
  for(const item of result.history)history.set(item.id,item);
  cursor=result.cursor;pullUntil=result.pullUntil;historyAfter=result.historyAfter;historyUntil=result.historyUntil;
  more=result.hasMore||result.historyHasMore;
  assert.ok(pages<=10,'Page progress must terminate');
 }while(more);
 assert.equal(items.size,600);assert.equal(history.size,400);assert.ok(pages>=3);
 assert.ok([...items.values()].filter(i=>i.title.startsWith('Updated ')).length===400);
 const first=await sync();
 const later={id:randomUUID(),itemId:randomUUID(),kind:'todo',action:'patch',patch:{title:'After snapshot'}};
 await sync([later]);
 let boundCursor=first.cursor,historyCursor=first.historyAfter;let last=first;
 do{last=await sync([],boundCursor,first.pullUntil,historyCursor,first.historyUntil);boundCursor=last.cursor;historyCursor=last.historyAfter;}while(last.hasMore||last.historyHasMore);
 const catchup=await sync([],boundCursor);
 assert.ok(catchup.items.some(i=>i.id===later.itemId),'Post-snapshot insertion must remain discoverable');
 const legacy=(await db.query('select public.tick_sync($1::jsonb,0) as value',['[]'])).rows[0].value;
 assert.equal(legacy.items.length,601,'Legacy clients retain their full sync contract');
 await as(other);const isolated=await sync();assert.deepEqual(isolated.items,[]);assert.deepEqual(isolated.history,[]);
 console.log('PASS: bounded item/history pages, monotonic cursors, 600 items/400 history rows, lost-response replay, full traversal and account isolation.');
} finally {await db.query('rollback');await db.end();console.log('Rolled back schema and temporary test data; sequence gaps are harmless.');}
