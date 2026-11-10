import fs from 'node:fs';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
if(!process.env.TICK_TEST_DATABASE_ENV_FILE)throw Error('Set TICK_TEST_DATABASE_ENV_FILE to an authorized test database environment file.');
const source=fs.readFileSync(process.env.TICK_TEST_DATABASE_ENV_FILE,'utf8');
const connectionString=source.match(/^DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g,'');
const db=new pg.Client({connectionString,connectionTimeoutMillis:15000});
const id=randomUUID(),email=`tick-browser-${id}@example.invalid`,password=randomUUID()+randomUUID();
const base=process.env.TICK_TEST_BASE_URL??'http://localhost:3001';
await db.connect();let browser;
try{
 await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change,email_change_token_new,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000',$1::uuid,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'','','','', '{"provider":"email","providers":["email"]}','{}',now(),now())`,[id,email,password]);
 await db.query(`insert into auth.identities(id,user_id,identity_data,provider,provider_id,created_at,updated_at) values(gen_random_uuid(),$1::uuid,jsonb_build_object('sub',$1::text,'email',$2::text,'email_verified',true),'email',$1::text,now(),now())`,[id,email]);
 browser=await chromium.launch({headless:true,executablePath:process.env.TICK_CHROMIUM_PATH??'/opt/google/chrome/chrome',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:960}});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/app');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('heading',{name:/Less thinking/}).waitFor();await page.getByLabel('New task',{exact:true}).fill('Online task');await page.getByRole('button',{name:'Add item',exact:true}).click();await page.getByRole('button',{name:'Online task',exact:true}).waitFor();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
 await context.setOffline(true);await page.getByLabel('New task',{exact:true}).fill('Offline task');await page.getByRole('button',{name:'Add item',exact:true}).click();await page.getByRole('button',{name:'Offline task',exact:true}).waitFor();await page.reload();await page.getByRole('button',{name:'Offline task',exact:true}).waitFor();
 await context.setOffline(false);await page.getByRole('button',{name:/pending|Syncing|Up to date/}).first().click();await page.waitForFunction(()=>document.querySelector('.sync-indicator')?.textContent?.includes('Up to date'),{timeout:30000});
 const row=page.locator('.task-row').filter({has:page.getByRole('button',{name:'Offline task',exact:true})});await row.getByRole('button',{name:'Complete item'}).click();await page.getByRole('button',{name:'Undo',exact:true}).waitFor();await page.getByRole('button',{name:'Undo',exact:true}).click();await page.getByRole('button',{name:'Offline task',exact:true}).waitFor();
 await page.getByRole('button',{name:'Watchlist',exact:false}).first().click();await page.getByLabel('New movie or TV title',{exact:true}).fill('Manual TV title');await page.getByRole('button',{name:'Add item',exact:true}).click();await page.getByRole('button',{name:'Manual TV title',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Mobile layout overflows horizontally');
 assert.deepEqual(errors,[],'Browser runtime errors');
 console.log('PASS: browser sign-in, online add, offline add + reload, reconnect sync, completion/Undo, manual watchlist, responsive layout, no runtime errors.');
}finally{if(browser)await browser.close();await db.query('delete from auth.users where id=$1',[id]);await db.end();console.log('Removed browser verification account/data.');}
