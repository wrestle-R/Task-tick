import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
// Authorized hosted integration only. Admin-generated fixture links do not prove mail delivery.
const adminKey=process.env.TICK_TEST_SUPABASE_ADMIN_KEY_FILE
 ? fs.readFileSync(process.env.TICK_TEST_SUPABASE_ADMIN_KEY_FILE,'utf8').trim()
 : process.env.TICK_TEST_SUPABASE_ADMIN_KEY;
if(!adminKey)throw Error('Provide an authorized test-project admin key privately.');
const site=process.env.TICK_TEST_SITE_URL??'https://task-tick-beige.vercel.app';
const config=await fetch(`${site}/api/config`).then(r=>r.json());
assert.ok(config.url?.startsWith('https://')&&config.key,'Configured public auth service required');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(config.url,adminKey,options);
const client=()=>createClient(config.url,config.key,options);
const email=`tick-recovery-${randomUUID()}@example.invalid`,oldPassword=randomUUID()+randomUUID(),newPassword=randomUUID()+randomUUID();
let userId;
try {
 const created=await admin.auth.admin.createUser({email,password:oldPassword,email_confirm:true});
 if(created.error)throw Error(`Fixture creation failed: ${created.error.code??created.error.status}`);
 userId=created.data.user.id;
 const generated=await admin.auth.admin.generateLink({type:'recovery',email,options:{redirectTo:`${site}/app`}});
 if(generated.error)throw Error(`Fixture recovery link failed: ${generated.error.code??generated.error.status}`);
 const tokenHash=generated.data.properties.hashed_token;
 assert.ok(tokenHash);
 assert.equal(new URL(generated.data.properties.action_link).searchParams.get('redirect_to'),`${site}/app`);
 const recovery=client();
 const verified=await recovery.auth.verifyOtp({token_hash:tokenHash,type:'recovery'});
 assert.equal(verified.error,null);assert.equal(verified.data.user.id,userId);
 assert.ok(verified.data.session);
 const updated=await recovery.auth.updateUser({password:newPassword});
 assert.equal(updated.error,null);assert.equal(updated.data.user.id,userId);
 const rejected=await client().auth.signInWithPassword({email,password:oldPassword});
 assert.ok(rejected.error,'Previous password must fail after recovery');
 const accepted=await client().auth.signInWithPassword({email,password:newPassword});
 assert.equal(accepted.error,null);assert.equal(accepted.data.user.id,userId);
 const reused=await client().auth.verifyOtp({token_hash:tokenHash,type:'recovery'});
 assert.ok(reused.error,'Recovery link must be single use');
 const invalid=await client().auth.verifyOtp({token_hash:randomUUID(),type:'recovery'});
 assert.ok(invalid.error,'Invalid recovery link must fail');
 console.log('PASS: production redirect, recovery session ownership, password update, previous-password rejection, new-password sign-in, reused/invalid token rejection. No real mailbox password changed.');
} finally {
 if(userId){const deleted=await admin.auth.admin.deleteUser(userId);if(deleted.error)throw Error('Recovery fixture cleanup failed');console.log('Temporary recovery account removed.');}
}
