import fs from 'node:fs';
import { themes, themeGeometry } from '../../core/src/theme.ts';
let css='/* Shared palette: generated from packages/core/src/theme.ts. */\n';
css+=':root { --radius-control: '+themeGeometry.controlRadius+'px; --radius-panel: '+themeGeometry.panelRadius+'px; }\n';
for(const [name,tokens] of Object.entries(themes)) {
 css+=(name==='light'?':root, [data-theme="light"]':':root[data-theme="dark"], [data-theme="dark"]')+' {\n';
 for(const [key,value] of Object.entries(tokens))css+='  --'+(key==='accentInk'?'accent-ink':key)+': '+value+';\n';
 css+='  color-scheme: '+name+';\n}\n';
}
let kotlin='// Generated from packages/core/src/theme.ts. Run packages/ui/scripts/theme.mjs.\npackage com.tickanddone\n\nimport android.content.Context\nimport android.content.res.Configuration\nimport android.graphics.Color\n\ndata class NativePalette(\n';
const keys=Object.keys(themes.light);
kotlin+=keys.map(key=>' val '+key+': Int').join(',\n')+'\n) {\n companion object {\n';
for(const [name,tokens] of Object.entries(themes))kotlin+='  val '+name+'=NativePalette('+Object.values(tokens).map(value=>'Color.parseColor("'+value+'")').join(',')+')\n';
kotlin+='  const val panelRadius='+themeGeometry.panelRadius+'\n  fun current(context:Context):NativePalette { val mode=TickRepository.get(context).appearance(); return if(mode=="dark"||(mode=="system"&&context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES)) dark else light }\n  fun dialogContext(context:Context)=android.view.ContextThemeWrapper(context,if(current(context)==light) R.style.QuickComposeLightDialog else R.style.QuickComposeDarkDialog)\n }\n}\n';
const outputs=[
 [new URL('../src/theme.css',import.meta.url),css],
 [new URL('../../../app/android/app/src/main/java/com/tickanddone/NativePalette.kt',import.meta.url),kotlin],
];
for(const [target,content] of outputs) {
 if(process.argv.includes('--check')) {
  if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==content)throw Error('Shared theme output is stale; run node packages/ui/scripts/theme.mjs');
 } else fs.writeFileSync(target,content);
}
