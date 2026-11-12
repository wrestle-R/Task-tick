package com.tickanddone

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest

object Updates {
 private fun read(url:String):String {
  val c=URI(url).toURL().openConnection() as HttpURLConnection
  c.connectTimeout=12000;c.readTimeout=20000
  try {require(c.responseCode==200){"Update service is unavailable"};return c.inputStream.bufferedReader().use{it.readText()}}finally{c.disconnect()}
 }
 private fun trusted(url:String):Boolean {val u=URI(url);return u.scheme=="https"&&u.host=="github.com"&&u.path.startsWith("/wrestle-R/Task-tick/releases/download/")}
 private fun newer(version:String):Boolean {
  fun parts(s:String)=s.removePrefix("v").split('.').map{it.toIntOrNull()?:-1}
  val next=parts(version);val current=parts(BuildConfig.VERSION_NAME)
  if(next.size!=3||next.any{it<0})return false
  for(i in 0..2){if(next[i]!=current[i])return next[i]>current[i]};return false
 }
 fun check():JSONObject? {
  val data=JSONObject(read("https://task-tick-beige.vercel.app/api/releases"));val release=data.optJSONObject("release")?:return null
  val apk=release.optJSONObject("android")?:return null
  if(!newer(release.optString("version"))||!trusted(apk.optString("url"))||!apk.optString("sha256").matches(Regex("[a-f0-9]{64}")))return null
  return release
 }
 fun install(c:Context):String {
  if(android.os.Build.VERSION.SDK_INT>=26&&!c.packageManager.canRequestPackageInstalls()){
   c.startActivity(Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:${c.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
   return "Allow installs from Task-tick, then tap Update again."
  }
  val release=check()?:return "You already have the latest available version."
  val apk=release.getJSONObject("android");val dir=java.io.File(c.cacheDir,"updates").apply{mkdirs()};val file=java.io.File(dir,"task-tick.apk")
  val connection=URI(apk.getString("url")).toURL().openConnection() as HttpURLConnection
  connection.connectTimeout=15000;connection.readTimeout=60000
  try {
   require(connection.responseCode==200){"Could not download the update"}
   val digest=MessageDigest.getInstance("SHA-256");var total=0L
   connection.inputStream.use{input->file.outputStream().use{output->val buffer=ByteArray(65536);while(true){val n=input.read(buffer);if(n<0)break;total+=n;require(total<=350L*1024*1024){"Update is too large"};digest.update(buffer,0,n);output.write(buffer,0,n)}}}
   val hash=digest.digest().joinToString(""){"%02x".format(it)}
   require(hash==apk.getString("sha256")){"Update checksum did not match. Try again."}
   val uri=FileProvider.getUriForFile(c,"${c.packageName}.updates",file)
   c.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION))
   return "Confirm the update in Android’s installer. Your lists stay on this device."
  } catch(e:Exception){file.delete();throw e} finally {connection.disconnect()}
 }
}
