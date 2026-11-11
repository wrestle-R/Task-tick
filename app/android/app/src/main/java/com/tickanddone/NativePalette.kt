// Generated from packages/core/src/theme.ts. Run packages/ui/scripts/theme.mjs.
package com.tickanddone

import android.content.Context
import android.content.res.Configuration
import android.graphics.Color

data class NativePalette(
 val paper: Int,
 val surface: Int,
 val sidebar: Int,
 val ink: Int,
 val muted: Int,
 val line: Int,
 val accent: Int,
 val accentInk: Int,
 val hover: Int,
 val error: Int
) {
 companion object {
  val light=NativePalette(Color.parseColor("#faf9f6"),Color.parseColor("#ffffff"),Color.parseColor("#f1f0eb"),Color.parseColor("#292c26"),Color.parseColor("#81847a"),Color.parseColor("#e5e5dd"),Color.parseColor("#d8ed96"),Color.parseColor("#354422"),Color.parseColor("#f2f3eb"),Color.parseColor("#9b4039"))
  val dark=NativePalette(Color.parseColor("#171a17"),Color.parseColor("#20241e"),Color.parseColor("#1c201b"),Color.parseColor("#e9ecdf"),Color.parseColor("#9caa94"),Color.parseColor("#353e30"),Color.parseColor("#c6e482"),Color.parseColor("#233118"),Color.parseColor("#293125"),Color.parseColor("#ffa79b"))
  const val panelRadius=18
  fun current(context:Context):NativePalette { val mode=TickRepository.get(context).appearance(); return if(mode=="dark"||(mode=="system"&&context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES)) dark else light }
  fun dialogContext(context:Context)=android.view.ContextThemeWrapper(context,if(current(context)==light) R.style.QuickComposeLightDialog else R.style.QuickComposeDarkDialog)
 }
}
