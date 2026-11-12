import fs from 'node:fs';import pg from 'pg';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
if(!process.env.TICK_TEST_DATABASE_ENV_FILE)throw Error('Set authorized database environment file');
const text=fs.readFileSync(process.env.TICK_TEST_DATABASE_ENV_FILE,'utf8');const connectionString=text.match(/^DATABASE_URL\s*=\s*(.+)$/m)[1].trim().replace(/^["']|["']$/g,'');const db=new pg.Client({connectionString});await db.connect();
try{await db.query('BEGIN');const a=randomUUID(),b=randomUUID();for(const id of [a,b])await db.query("insert into auth.users(id,instance_id,aud,role) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated')",[id]);
await db.query('SET LOCAL ROLE authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[a]);await db.query("insert into public.tick_push_devices(user_id,token) values($1,$2)",[a,'isolated-test-token-1234567890']);
await db.query("select set_config('request.jwt.claim.sub',$1,true)",[b]);assert.equal((await db.query('select * from public.tick_push_devices')).rowCount,0);assert.equal((await db.query('delete from public.tick_push_devices')).rowCount,0);
await db.query("select set_config('request.jwt.claim.sub',$1,true)",[a]);assert.equal((await db.query('select * from public.tick_push_devices')).rowCount,1);await db.query('ROLLBACK');console.log('PASS: push registry account isolation, cross-account deletion refusal and owner visibility (rolled back).');
}finally{await db.query('ROLLBACK').catch(()=>{});await db.end();}
