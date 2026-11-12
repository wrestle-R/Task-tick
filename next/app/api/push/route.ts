import { authenticated } from '../../../lib/server';
import { allowRequest } from '../../../lib/limits';
export async function POST(request: Request) {
 try {
  const {client,user}=await authenticated(request);
  if(!allowRequest(`push-register:${user.id}`,30)) return Response.json({error:'Try again later'},{status:429});
  const {token}=await request.json();
  if(typeof token!=='string'||token.length<20||token.length>4096) return Response.json({error:'Invalid device token'},{status:400});
  const {error}=await client.from('tick_push_devices').upsert({user_id:user.id,token,updated_at:new Date().toISOString()});
  if(error) throw Error('Device registration unavailable');
  return Response.json({ok:true});
 } catch {return Response.json({error:'Device registration unavailable. Sign in and retry.'},{status:400});}
}
