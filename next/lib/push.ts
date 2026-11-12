import 'server-only';
import { createSign } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
let cached: {token:string;until:number}|undefined;
async function credential() {
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
 if(!raw) return null;
 const key=JSON.parse(raw);
 if(cached && cached.until>Date.now()+60000) return {project:key.project_id,token:cached.token};
 const now=Math.floor(Date.now()/1000),encode=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const value=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:key.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const signature=createSign('RSA-SHA256').update(value).sign(key.private_key,'base64url');
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:value+'.'+signature}),signal:AbortSignal.timeout(8000)});
 const data=await response.json();if(!response.ok||!data.access_token)throw Error('Push authentication unavailable');
 cached={token:data.access_token,until:Date.now()+Number(data.expires_in)*1000};return {project:key.project_id,token:cached.token};
}
/** No content is sent by push. Missed/delayed hints recover through cursor sync. */
export async function signalDevices(client:SupabaseClient,owner:string) {
 const auth=await credential();if(!auth)return;
 const {data,error}=await client.from('tick_push_devices').select('token').eq('user_id',owner).gt('updated_at',new Date(Date.now()-30*86400000).toISOString()).limit(100);
 if(error)throw Error('Push device lookup unavailable');
 await Promise.all((data??[]).map(async ({token})=>{
  const r=await fetch(`https://fcm.googleapis.com/v1/projects/${auth.project}/messages:send`,{method:'POST',headers:{Authorization:`Bearer ${auth.token}`,'Content-Type':'application/json'},body:JSON.stringify({message:{token,data:{type:'sync',account:owner},android:{priority:'normal',collapse_key:'task-tick-sync',ttl:'86400s'}}}),signal:AbortSignal.timeout(8000)});
  const result=await r.json();
  if(result.error?.details?.some((d:{errorCode?:string})=>d.errorCode==='UNREGISTERED'))await client.from('tick_push_devices').delete().eq('user_id',owner).eq('token',token);
  else if(!r.ok)throw Error('Push delivery unavailable');
 }));
}
