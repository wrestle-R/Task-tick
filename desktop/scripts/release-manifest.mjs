import fs from 'node:fs';
import path from 'node:path';
const directory=process.argv[2]??'artifacts';
const tag=process.env.RELEASE_TAG;
if(!/^v\d+\.\d+\.\d+$/.test(tag??''))throw new Error('Expected a stable vX.Y.Z release tag');
const name='Task-tick-linux-x86_64.AppImage';
const signature=fs.readFileSync(path.join(directory,name+'.sig'),'utf8').trim();
if(!signature)throw new Error('Missing updater signature');
fs.writeFileSync(path.join(directory,'latest.json'),JSON.stringify({version:tag.slice(1),notes:'Task-tick '+tag,pub_date:new Date().toISOString(),platforms:{'linux-x86_64':{signature,url:`https://github.com/wrestle-R/Task-tick/releases/download/${tag}/${name}`}}},null,2)+'\n');
