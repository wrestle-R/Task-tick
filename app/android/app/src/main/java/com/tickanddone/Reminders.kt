package com.tickanddone
import android.app.*
import android.content.*
import android.os.Build
import android.Manifest
import android.content.pm.PackageManager
import java.time.Instant
object Reminders {
 fun canScheduleExact(c:Context):Boolean=Build.VERSION.SDK_INT<31||c.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
 private fun pending(c:Context)=PendingIntent.getBroadcast(c,200,Intent(c,ReminderReceiver::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
 fun schedule(c:Context){val repository=TickRepository.get(c);synchronized(repository){
  val alarm=c.getSystemService(AlarmManager::class.java);alarm.cancel(pending(c));val data=repository.read().getJSONArray("items");val now=System.currentTimeMillis();var next=Long.MAX_VALUE
  for(i in 0 until data.length()){val item=data.getJSONObject(i);if(!item.optBoolean("done")&&item.isNull("deletedAt")&&!item.isNull("dueAt")){try{val time=Instant.parse(item.getString("dueAt")).toEpochMilli();if(time>now)next=minOf(next,time)}catch(_:Exception){}}}
  if(next!=Long.MAX_VALUE){if(canScheduleExact(c)){try{alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next,pending(c))}catch(_:SecurityException){alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next,pending(c))}}else alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next,pending(c))}
 }}

 fun notifyDue(c:Context){if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;val repository=TickRepository.get(c);synchronized(repository){val account=repository.account()?:return;val prefs=c.getSharedPreferences("notified-$account",Context.MODE_PRIVATE);val data=repository.read().getJSONArray("items");val due=mutableListOf<String>();val editor=prefs.edit();for(i in 0 until data.length()){val item=data.getJSONObject(i);val time=item.optString("dueAt");try{if(!item.optBoolean("done")&&item.isNull("deletedAt")&&Instant.parse(time).toEpochMilli()<=System.currentTimeMillis()&&prefs.getString(item.getString("id"),null)!=time){due.add(item.getString("title"));editor.putString(item.getString("id"),time)}}catch(_:Exception){}};if(due.isEmpty())return;val manager=c.getSystemService(NotificationManager::class.java);manager.createNotificationChannel(NotificationChannel("reminders","Task reminders",NotificationManager.IMPORTANCE_DEFAULT));val notification=Notification.Builder(c,"reminders").setSmallIcon(R.drawable.ic_tick).setContentTitle(if(due.size==1)due[0] else "${due.size} unfinished tasks are due").setContentText("Open Task-tick to see your list.").setAutoCancel(true).setContentIntent(PendingIntent.getActivity(c,201,Widgets.launch(c,"todo"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)).build();manager.notify(201,notification);editor.apply()}}
}
class ReminderReceiver:BroadcastReceiver(){override fun onReceive(c:Context,i:Intent){val p=goAsync();Thread{try{Reminders.notifyDue(c);Reminders.schedule(c);if(i.action==Intent.ACTION_BOOT_COMPLETED)TickRepository.get(c).scheduleSync()}finally{p.finish()}}.start()}}
