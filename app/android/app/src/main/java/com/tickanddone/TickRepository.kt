package com.tickanddone

import android.content.Context
import android.content.ContentValues
import android.database.sqlite.SQLiteOpenHelper
import android.database.sqlite.SQLiteDatabase
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.util.Base64
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.time.Instant

class TickRepository private constructor(private val context: Context) : SQLiteOpenHelper(context,"tick.sqlite3",null,1) {
 companion object { @Volatile private var instance:TickRepository?=null; fun get(c:Context)=instance?:synchronized(this){instance?:TickRepository(c.applicationContext).also{instance=it}} }
 private val syncLock=Any()
 private val prefs=context.getSharedPreferences("tick-settings",Context.MODE_PRIVATE)
 override fun onCreate(db:SQLiteDatabase){db.execSQL("CREATE TABLE accounts(id TEXT PRIMARY KEY,state TEXT NOT NULL)")}
 override fun onUpgrade(db:SQLiteDatabase,old:Int,new:Int){}
 override fun onConfigure(db:SQLiteDatabase){db.enableWriteAheadLogging();db.execSQL("PRAGMA synchronous=FULL")}
 fun account():String?=prefs.getString("account",null)
 fun backend():String="https://task-tick-beige.vercel.app"
 private fun empty()=JSONObject("{\"items\":[],\"outbox\":[],\"history\":[],\"cursor\":0}")
 @Synchronized fun read():JSONObject {val a=account()?:return empty();readableDatabase.rawQuery("SELECT state FROM accounts WHERE id=?",arrayOf(a)).use{if(it.moveToFirst())return JSONObject(it.getString(0))};return empty()}
 private fun save(s:JSONObject){val a=account()?:throw IllegalStateException("Sign in first");writableDatabase.insertWithOnConflict("accounts",null,ContentValues().apply{put("id",a);put("state",s.toString())},SQLiteDatabase.CONFLICT_REPLACE)}
 fun snapshot():JSONObject=JSONObject().put("state",read()).put("email",prefs.getString("email",null)).put("account",account()).put("backend",backend()).put("preciseAlarms",Reminders.canScheduleExact(context))
 private fun key():javax.crypto.SecretKey{val ks=KeyStore.getInstance("AndroidKeyStore").apply{load(null)};return (ks.getKey("tick-session",null) as? javax.crypto.SecretKey)?:KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{init(KeyGenParameterSpec.Builder("tick-session",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())}.generateKey()}
 private fun writeSession(value:JSONObject){val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());val data=c.iv+c.doFinal(value.toString().toByteArray());prefs.edit().putString("session",Base64.encodeToString(data,Base64.NO_WRAP)).commit()}
 private fun session():JSONObject{val bytes=Base64.decode(prefs.getString("session",null)?:throw IllegalStateException("Sign in again to sync. Saved edits are safe."),Base64.NO_WRAP);val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)));return JSONObject(String(c.doFinal(bytes.copyOfRange(12,bytes.size))))}
 private fun request(url:String,body:JSONObject?=null,token:String?=null,key:String?=null):JSONObject {
  val con=URL(url).openConnection() as HttpURLConnection;con.connectTimeout=15000;con.readTimeout=20000;con.setRequestProperty("Content-Type","application/json");if(token!=null)con.setRequestProperty("Authorization","Bearer $token");if(key!=null)con.setRequestProperty("apikey",key)
  if(body!=null){con.requestMethod="POST";con.doOutput=true;con.outputStream.use{it.write(body.toString().toByteArray())}}
  try{val code=con.responseCode;val text=(if(code in 200..299)con.inputStream else con.errorStream)?.bufferedReader()?.use{it.readText()}?:"{}";val result=JSONObject(text);if(code !in 200..299)throw IllegalStateException(result.optString("error_description",result.optString("msg",result.optString("error","Request failed ($code)"))));return result}finally{con.disconnect()}
 }
 fun authenticate(mode:String,email:String,password:String,api:String):String {
  val site=api.trim().trimEnd('/');require(site.startsWith("https://")||(BuildConfig.DEBUG&&site.startsWith("http://"))){"Use an HTTPS website URL"}
  val config=request("$site/api/config");val url=config.optString("url");val key=config.optString("key");require(url.startsWith("https://")&&key.isNotEmpty()){"Account service is not configured"}
  prefs.edit().putString("backend",site).putString("supabase",url).putString("clientKey",key).commit()
  val redirect=java.net.URLEncoder.encode("$site/app","UTF-8")
  val endpoint=when(mode){"signup"->"signup?redirect_to=$redirect";"reset"->"recover?redirect_to=$redirect";else->"token?grant_type=password"}
  val body=JSONObject().put("email",email).put("password",password);val response=request("$url/auth/v1/$endpoint",body,key=key)
  if(response.has("access_token")){writeSession(response);prefs.edit().putString("account",response.getJSONObject("user").getString("id")).putString("email",email).commit();scheduleSync();Widgets.refresh(context);return "Signed in"}
  return if(mode=="reset")"Check your email for a password reset link." else "Check your email to verify your account, then sign in."
 }
 private fun accessToken():String{val owner=account()?:throw IllegalStateException("Sign in to sync");var s=session();if(s.optLong("expires_at",0)<System.currentTimeMillis()/1000+60){s=request("${prefs.getString("supabase","")}/auth/v1/token?grant_type=refresh_token",JSONObject().put("refresh_token",s.getString("refresh_token")),key=prefs.getString("clientKey",null));synchronized(this){check(account()==owner){"Account changed. Sign in to sync."};writeSession(s)}};check(account()==owner){"Account changed. Sign in to sync."};return s.getString("access_token")}
 @Synchronized fun logout(){prefs.edit().remove("account").remove("email").remove("session").commit();Widgets.refresh(context);Reminders.schedule(context)}
 private fun defaultItem(id:String,kind:String)=JSONObject().put("id",id).put("kind",kind).put("title","").put("done",false).put("notes","").put("priority",0).put("dueAt",JSONObject.NULL).put("parentId",JSONObject.NULL).put("position",System.currentTimeMillis()).put("rating",JSONObject.NULL).put("mediaType",JSONObject.NULL).put("tmdbId",JSONObject.NULL).put("poster",JSONObject.NULL).put("deletedAt",JSONObject.NULL)
 private fun patchItem(s:JSONObject,id:String,kind:String,patch:JSONObject,action:String="patch"){
  val items=s.getJSONArray("items");var target:JSONObject?=null;for(i in 0 until items.length()){val item=items.getJSONObject(i);if(item.getString("id")==id){target=item;break}}
  if(target==null){if(action!="patch")return;target=defaultItem(id,kind);items.put(target)}
  if(!target.isNull("deletedAt")&&action=="patch")return
  val now=Instant.now().toString();s.getJSONArray("history").put(JSONObject().put("id",UUID.randomUUID().toString()).put("item",JSONObject(target.toString())).put("at",now))
  for(k in patch.keys())target.put(k,patch.get(k));target.put("updatedAt",now)
  if(action=="delete")target.put("deletedAt",now);if(action=="restore")target.put("deletedAt",JSONObject.NULL)
  s.getJSONArray("outbox").put(JSONObject().put("id",UUID.randomUUID().toString()).put("itemId",id).put("kind",kind).put("action",action).put("patch",patch))
 }
 @Synchronized fun mutate(raw:String):JSONObject{
  require(account()!=null){"Open Tick and Done and sign in first"};val m=JSONObject(raw);val kind=m.optString("kind","todo");require(kind=="todo"||kind=="movie");val action=m.optString("action","patch");val s=read();val id=m.optString("id").ifEmpty{UUID.randomUUID().toString()};val patch=m.optJSONObject("patch")?:JSONObject()
  if(patch.has("title"))require(patch.getString("title").trim().isNotEmpty()&&patch.getString("title").length<=500){"Enter a title (up to 500 characters)"}
  if(action=="undo"){
   val u=s.optJSONObject("undo");if(u!=null&&u.optLong("until")>System.currentTimeMillis()){val previous=u.getJSONArray("items");for(i in 0 until previous.length()){val p=previous.getJSONObject(i);patchItem(s,p.getString("id"),p.getString("kind"),JSONObject().put("done",p.getBoolean("done")))}};s.remove("undo")
  }else{
   val previous=JSONArray();val items=s.getJSONArray("items");val ids=mutableListOf<String>();ids.add(id)
   if(patch.has("done")){for(i in 0 until items.length()){val item=items.getJSONObject(i);if(item.getString("id")==id||(patch.getBoolean("done")&&item.optString("parentId")==id&&!item.optBoolean("done")&&item.isNull("deletedAt"))){previous.put(JSONObject(item.toString()));if(item.getString("id")!=id)ids.add(item.getString("id"))}}
    s.put("undo",JSONObject().put("items",previous).put("until",System.currentTimeMillis()+10000))
   }
   patchItem(s,id,kind,patch,action);for(child in ids.drop(1))patchItem(s,child,"todo",JSONObject().put("done",true))
   if(action=="delete"){val children=mutableListOf<String>();for(i in 0 until items.length()){val item=items.getJSONObject(i);if(item.optString("parentId")==id&&item.isNull("deletedAt"))children.add(item.getString("id"))};for(child in children)patchItem(s,child,"todo",JSONObject(),"delete")}
  }
  writableDatabase.beginTransaction();try{save(s);writableDatabase.setTransactionSuccessful()}finally{writableDatabase.endTransaction()};Widgets.refresh(context);Reminders.schedule(context);scheduleSync();return snapshot()
 }
 fun scheduleSync(){val scheduler=context.getSystemService(JobScheduler::class.java);scheduler.schedule(JobInfo.Builder(100,ComponentName(context,TickSyncJob::class.java)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setOverrideDeadline(1000).build());scheduler.schedule(JobInfo.Builder(101,ComponentName(context,TickSyncJob::class.java)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000L).setPersisted(true).build())}
 fun sync():JSONObject = synchronized(syncLock) {
  val a=account()?:return snapshot();val token=accessToken();val before=synchronized(this){read()};val pending=JSONArray();for(i in 0 until minOf(100,before.getJSONArray("outbox").length()))pending.put(before.getJSONArray("outbox").getJSONObject(i))
  val result=request("${backend()}/api/sync",JSONObject().put("cursor",before.optLong("cursor")).put("mutations",pending),token)
  synchronized(this){if(a!=account())return snapshot();val current=read();val accepted=result.getJSONArray("accepted");val ack=(0 until accepted.length()).map{accepted.getString(it)}.toSet();val remaining=JSONArray();val queue=current.getJSONArray("outbox");for(i in 0 until queue.length())if(!ack.contains(queue.getJSONObject(i).getString("id")))remaining.put(queue.getJSONObject(i));
   val map=linkedMapOf<String,JSONObject>();val local=current.getJSONArray("items");for(i in 0 until local.length())map[local.getJSONObject(i).getString("id")]=local.getJSONObject(i);val incoming=result.getJSONArray("items");for(i in 0 until incoming.length())map[incoming.getJSONObject(i).getString("id")]=incoming.getJSONObject(i)
   for(i in 0 until remaining.length()){val m=remaining.getJSONObject(i);val item=map[m.getString("itemId")]?:continue;if(!item.isNull("deletedAt")&&m.getString("action")=="patch")continue;val p=m.getJSONObject("patch");for(k in p.keys())item.put(k,p.get(k));if(m.getString("action")=="delete")item.put("deletedAt",Instant.now().toString());if(m.getString("action")=="restore")item.put("deletedAt",JSONObject.NULL)}
   current.put("items",JSONArray(map.values.toList())).put("outbox",remaining).put("cursor",result.getLong("cursor")).put("history",result.getJSONArray("history"));save(current)
  };Widgets.refresh(context);Reminders.schedule(context);cachePosters();return snapshot()
 }
 fun posterFile(path:String):java.io.File=java.io.File(context.cacheDir,"posters/"+java.security.MessageDigest.getInstance("SHA-256").digest(path.toByteArray()).joinToString(""){"%02x".format(it)}+".jpg")
 private fun cachePosters(){val items=read().getJSONArray("items");var fetched=0;for(i in 0 until items.length()){val item=items.getJSONObject(i);val path=item.optString("poster");if(item.optString("kind")!="movie"||!path.matches(Regex("^/[a-zA-Z0-9._-]+$")))continue;val file=posterFile(path);if(file.exists()||fetched>=10)continue;try{val con=URL("https://image.tmdb.org/t/p/w92$path").openConnection() as HttpURLConnection;con.connectTimeout=3000;con.readTimeout=3000;val data=con.inputStream.use{it.readNBytes(600000)};con.disconnect();if(data.isNotEmpty()&&data.size<600000){file.parentFile?.mkdirs();val temp=java.io.File(file.path+".tmp");temp.writeBytes(data);temp.renameTo(file);fetched++}}catch(_:Exception){}};if(fetched>0)Widgets.refresh(context)}
 fun search(q:String):JSONObject=request("${backend()}/api/movies?q=${java.net.URLEncoder.encode(q,"UTF-8")}",token=accessToken())
}
