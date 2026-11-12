package com.tickanddone
import com.facebook.react.bridge.*
import com.facebook.react.ReactPackage
import com.facebook.react.uimanager.ViewManager
import android.app.job.JobService
import android.app.job.JobParameters
import java.util.concurrent.Executors

class TickModule(private val context:ReactApplicationContext):ReactContextBaseJavaModule(context){
 private val executor=Executors.newSingleThreadExecutor();override fun getName()="TickStore"
 override fun getConstants():MutableMap<String,Any> = mutableMapOf("appearance" to TickRepository.get(context).appearance())
 private fun run(p:Promise,f:()->Any?){executor.execute{try{p.resolve(f())}catch(e:Exception){p.reject("TICK_ERROR",e.message,e)}}}
 @ReactMethod fun resume(p:Promise)=run(p){TickRepository.get(context).resume().toString()}
 @ReactMethod fun snapshot(p:Promise)=run(p){Reminders.notifyDue(context);TickRepository.get(context).snapshot().toString()}
 @ReactMethod fun mutate(value:String,p:Promise)=run(p){TickRepository.get(context).mutate(value).toString()}
 @ReactMethod fun setAppearance(value:String,p:Promise)=run(p){TickRepository.get(context).setAppearance(value).toString()}
 @ReactMethod fun reorder(value:String,p:Promise)=run(p){TickRepository.get(context).reorder(value).toString()}
 @ReactMethod fun authenticate(mode:String,email:String,password:String,backend:String,p:Promise)=run(p){TickRepository.get(context).authenticate(mode,email,password,backend)}
 @ReactMethod fun sync(p:Promise)=run(p){TickRepository.get(context).sync().toString()}
 @ReactMethod fun logout(p:Promise)=run(p){TickRepository.get(context).logout();null}
 @ReactMethod fun checkUpdate(p:Promise)=run(p){Updates.check()?.toString()}
 @ReactMethod fun installUpdate(p:Promise)=run(p){Updates.install(context)}
 @ReactMethod fun search(q:String,p:Promise)=run(p){TickRepository.get(context).search(q).toString()}
 @ReactMethod fun pickDueDate(p:Promise){val activity=context.currentActivity;if(activity==null){p.reject("NO_ACTIVITY","Open the app first");return};activity.runOnUiThread{val calendar=java.util.Calendar.getInstance();android.app.DatePickerDialog(NativePalette.dialogContext(activity),{_,year,month,day->android.app.TimePickerDialog(NativePalette.dialogContext(activity),{_,hour,minute->calendar.set(year,month,day,hour,minute,0);p.resolve(java.time.Instant.ofEpochMilli(calendar.timeInMillis).toString())},calendar.get(java.util.Calendar.HOUR_OF_DAY),calendar.get(java.util.Calendar.MINUTE),false).apply{setOnCancelListener{p.resolve(null)}}.show()},calendar.get(java.util.Calendar.YEAR),calendar.get(java.util.Calendar.MONTH),calendar.get(java.util.Calendar.DAY_OF_MONTH)).apply{setOnCancelListener{p.resolve(null)}}.show()}}
 @ReactMethod fun requestExactAlarms(p:Promise){try{val intent=android.content.Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).setData(android.net.Uri.parse("package:${context.packageName}")).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);context.startActivity(intent);p.resolve(null)}catch(e:Exception){p.reject("ALARM_SETTINGS",e.message,e)}}
}
class TickPackage:ReactPackage{override fun createNativeModules(c:ReactApplicationContext)=listOf<NativeModule>(TickModule(c));override fun createViewManagers(c:ReactApplicationContext)=emptyList<ViewManager<*,*>>()}
class TickSyncJob:JobService(){override fun onStartJob(p:JobParameters):Boolean{Thread{var retry=false;try{TickRepository.get(this).sync()}catch(_:Exception){retry=true};jobFinished(p,retry)}.start();return true};override fun onStopJob(p:JobParameters)=true}
