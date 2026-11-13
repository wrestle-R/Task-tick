import assert from 'node:assert/strict';
const base=process.env.TICK_TEST_BASE_URL??'https://task-tick-beige.vercel.app';
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const forged=encode({alg:'none',typ:'JWT'})+'.'+encode({sub:'00000000-0000-0000-0000-000000000001',role:'service_role',exp:Math.floor(Date.now()/1000)+3600})+'.';
for(const token of [null,forged])for(const [path,method] of [['/api/sync','POST'],['/api/movies?q=Arrival','GET'],['/api/push','POST']]){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(method==='POST'?{body:JSON.stringify({mutations:[],cursor:0,token:'temporary-test-token-not-a-real-device'})}:{})});
 assert.ok(r.status>=400&&r.status<500,`${path}: unauthorized request must fail`);
 const body=await r.text();assert.ok(!body.includes(forged),'Do not reflect supplied credentials');
}
const config=await fetch(base+'/api/config').then(r=>r.json());assert.deepEqual(Object.keys(config).sort(),['key','url']);
if(!config.key.startsWith('sb_publishable_'))assert.equal(JSON.parse(Buffer.from(config.key.split('.')[1],'base64url')).role,'anon');
if(process.env.TICK_TEST_SECURITY_HEADERS){const r=await fetch(base+'/app');assert.equal(r.headers.get('x-frame-options'),'DENY');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.match(r.headers.get('content-security-policy')??'',/frame-ancestors 'none'/);}
console.log('PASS: missing/forged JWT rejected by sync/movie/push endpoints; config exposes publishable credentials only.');
