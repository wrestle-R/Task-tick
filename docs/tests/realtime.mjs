import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
if(!process.env.TICK_TEST_ACCOUNT_FILE)throw Error('Set private test account file');
const account=JSON.parse(fs.readFileSync(process.env.TICK_TEST_ACCOUNT_FILE));
const base=process.env.TICK_TEST_BASE_URL??'https://task-tick-beige.vercel.app';
const browser=await chromium.launch({headless:true,executablePath:process.env.TICK_CHROMIUM_PATH,args:['--no-sandbox']});
const title='Realtime acceptance '+randomUUID();let first;
try {
 const pages=await Promise.all([browser.newPage(),browser.newPage()]);first=pages[0];
 await Promise.all(pages.map(async p=>{await p.goto(base+'/app');await p.getByLabel('Email',{exact:true}).fill(account.email);await p.getByLabel('Password',{exact:true}).fill(account.password);await p.getByRole('button',{name:'Sign in',exact:true}).click();await p.getByRole('heading',{name:'Todos',exact:true}).waitFor();}));
 const row=p=>p.locator('.task-row').filter({has:p.getByRole('button',{name:title,exact:true})});
 await first.getByLabel('New task',{exact:true}).fill(title);await first.getByRole('button',{name:'Add item',exact:true}).click();
 await row(pages[1]).waitFor({timeout:12000});
 await row(pages[1]).getByRole('button',{name:'Complete item',exact:true}).click();
 await row(first).getByRole('button',{name:'Mark unfinished',exact:true}).waitFor({timeout:12000});
 await row(first).getByRole('button',{name:'Move to trash',exact:true}).click();await row(pages[1]).waitFor({state:'hidden',timeout:12000});
 console.log('PASS: event-driven add, reverse completion and deletion across independent clients, without manual sync or focus changes.');
} finally {
 if(first){const row=first.locator('.task-row').filter({has:first.getByRole('button',{name:title,exact:true})});if(await row.count())await row.getByRole('button',{name:'Move to trash',exact:true}).click().catch(()=>{});}
 await browser.close();
}
