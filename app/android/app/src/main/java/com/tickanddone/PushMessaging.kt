package com.tickanddone

import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Pushes contain only an account-bound invalidation hint, never task content. */
class PushMessaging : FirebaseMessagingService() {
 override fun onNewToken(token:String) {
  getSharedPreferences("tick-push",MODE_PRIVATE).edit().putString("token",token).remove("registered").apply()
  if(TickRepository.get(this).account()!=null) TickRepository.get(this).scheduleSync()
 }
 override fun onMessageReceived(message:RemoteMessage) {
  val repository=TickRepository.get(this)
  if(message.data["type"]=="sync" && message.data["account"]==repository.account()) repository.scheduleSync()
 }
 companion object {
  fun prepare(context:android.content.Context) {
   try { FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
    val prefs=context.getSharedPreferences("tick-push",android.content.Context.MODE_PRIVATE)
    if(prefs.getString("token",null)!=token) {prefs.edit().putString("token",token).remove("registered").apply();if(TickRepository.get(context).account()!=null)TickRepository.get(context).scheduleSync()}
   }}catch(_:IllegalStateException){ /* Configuration absent in unconfigured CI/debug builds. */ }
  }
 }
}
