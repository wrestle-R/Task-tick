import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.TICK_TEST_BASE_URL??'http://localhost:3004';
const browser=await chromium.launch({headless:true,executablePath:process.env.TICK_CHROMIUM_PATH,args:['--no-sandbox']});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const [width,height] of [[1366,768],[1024,720],[390,844],[320,640]]) {
  await page.setViewportSize({width,height});await page.goto(base);
  await page.locator('.fold-stamp img').evaluate(async image=>{await image.decode();});
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.marketing-site').getAttribute('data-theme'),'dark');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}: horizontal overflow`);
  for(const selector of ['#hero-heading','.desk-hero .desk-launch','.hero-footnote']) {
   const box=await page.locator(selector).boundingBox();
   assert.ok(box&&box.y>=0&&box.y+box.height<=height,`${width}: ${selector} must fit in first viewport`);
  }
  assert.equal(await page.locator('.desk-hero .desk-launch').getAttribute('href'),'/app');
  if(process.env.TICK_TEST_SCREENSHOTS){fs.mkdirSync(process.env.TICK_TEST_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.TICK_TEST_SCREENSHOTS}/hero-${width}.png`});}
 }
 assert.equal(await page.getByRole('link',{name:'Task-tick home'}).count(),1);
 await page.getByRole('button',{name:'Use light theme'}).click();
 await page.reload();await page.getByRole('button',{name:'Use dark theme'}).waitFor();
 assert.equal(await page.locator('.marketing-site').getAttribute('data-theme'),'light');
 await page.getByRole('button',{name:'Use dark theme'}).click();
 await page.getByRole('button',{name:'Open navigation'}).click();
 const menu=page.getByRole('navigation',{name:'Main navigation'});
 assert.equal(await menu.isVisible(),true);
 assert.equal(await menu.getByRole('link',{name:'Downloads',exact:true}).getAttribute('href'),'/downloads');
 await menu.getByRole('link',{name:'Downloads',exact:true}).focus();await page.keyboard.press('Escape');
 assert.equal(await menu.isVisible(),false);
 assert.equal(await page.getByRole('button',{name:'Open navigation'}).evaluate(button=>button===document.activeElement),true);
 for(const route of ['/docs','/downloads']) { await page.goto(base+route); await page.getByRole('button',{name:'Use light theme'}).waitFor(); assert.equal(await page.getByRole('link',{name:'Task-tick home'}).count(),1); await page.getByRole('button',{name:'Use light theme'}).click(); await page.getByRole('button',{name:'Use dark theme'}).waitFor(); await page.getByRole('button',{name:'Use dark theme'}).click(); }
 assert.deepEqual(errors,[]);
 console.log('PASS: approved hero image/text, first-view CTA/platform line at four viewport sizes, no overflow/runtime errors, persisted themes, accessible menu and Escape focus.');
} finally {await browser.close();}
