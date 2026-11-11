import fs from 'node:fs';
import { themes, themeGeometry } from '../../core/src/theme.ts';
let css='/* Shared palette: generated from packages/core/src/theme.ts. */\n';
css+=':root { --radius-control: '+themeGeometry.controlRadius+'px; --radius-panel: '+themeGeometry.panelRadius+'px; }\n';
for(const [name,tokens] of Object.entries(themes)) {
 css+=(name==='light'?':root':':root[data-theme="dark"]')+' {\n';
 for(const [key,value] of Object.entries(tokens))css+='  --'+(key==='accentInk'?'accent-ink':key)+': '+value+';\n';
 css+='  color-scheme: '+name+';\n}\n';
}
const target=new URL('../src/theme.css',import.meta.url);
if(process.argv.includes('--check')) {
 if(fs.readFileSync(target,'utf8')!==css)throw Error('Shared theme CSS is stale; run node packages/ui/scripts/theme.mjs');
} else fs.writeFileSync(target,css);
