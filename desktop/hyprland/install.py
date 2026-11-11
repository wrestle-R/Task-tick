#!/usr/bin/env python3
"""Install reversible integration into an existing illogical-impulse Quickshell setup."""
from pathlib import Path
import argparse,datetime,json,os,shutil,subprocess,difflib,hashlib
HOME=Path.home();BASE=Path(__file__).resolve().parent
START='-- Tick and Done integration START';END='-- Tick and Done integration END'
def block(source,text):
 if START in source:
  before,rest=source.split(START,1);_,after=rest.split(END,1);return before+START+'\n'+text+'\n'+END+after
 return source.rstrip()+'\n\n'+START+'\n'+text+'\n'+END+'\n'
def restore_changes(current,before,installed):
 """Reverse only installer edits, retaining independent later user edits."""
 if current==installed:return before
 changes=list(difflib.SequenceMatcher(None,before.splitlines(keepends=True),installed.splitlines(keepends=True),autojunk=False).get_opcodes())
 old=before.splitlines(keepends=True);new=installed.splitlines(keepends=True)
 for action,a,b,c,d in reversed(changes):
  if action=='equal':continue
  replacement=''.join(new[c:d]);original=''.join(old[a:b])
  if not replacement or current.count(replacement)!=1:
   raise RuntimeError('Integration was edited; refusing to overwrite user configuration. Resolve the conflicting managed section first.')
  current=current.replace(replacement,original,1)
 return current

def describe(path):
 if path.is_symlink():return {'kind':'symlink','target':os.readlink(path)}
 if path.is_file():return {'kind':'file','sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
 if path.exists():raise RuntimeError(f'Unexpected integration artifact type: {path}')
 return {'kind':'absent'}
def capture(path,backup):
 description=describe(path)
 if description['kind']=='file':
  shutil.copy2(path,backup);description['backup']=str(backup)
 return description
def restore_artifact(path,description):
 if path.exists() or path.is_symlink():path.unlink()
 if description['kind']=='file':shutil.copy2(description['backup'],path)
 elif description['kind']=='symlink':path.symlink_to(description['target'])

def launcher_text(binpath):
 return f'[Desktop Entry]\nType=Application\nName=Task-tick\nComment=Todos and your watchlist, within reach\nExec="{binpath}"\nIcon={HOME/".local/share/icons/hicolor/512x512/apps/task-tick.png"}\nTerminal=false\nCategories=Office;Utility;\nStartupWMClass=com.tickanddone.desktop\n'

def adopt_legacy(manifest,content,keys,execs,binpath,lib,sidebar,applications,binary):
 # Explicit adoption is limited to verified shipped artifacts and the known managed blocks.
 originals={target:Path(backup).read_text() for target,backup in manifest['backups'].items()}
 if any(START in value or 'TickDashboard {}' in value for value in originals.values()):raise RuntimeError('Legacy backups already contain integration; original baseline needs manual review.')
 helper=str(lib/'spotify.py')
 key_text=f'hl.unbind("SUPER + Space")\nhl.bind("SUPER + Space", hl.dsp.exec_cmd(\'python3 "{helper}" toggle\'), {{description="Spotify: play/pause with quiet startup"}})'
 exec_text=f'hl.on("hyprland.start", function ()\n    hl.exec_cmd(\'"{binpath}" --background\')\n    hl.exec_cmd(\'python3 "{helper}" watch\')\nend)'
 expected={str(content):originals[str(content)].replace('SidebarDashboard {}','TickDashboard {}'),str(keys):block(originals[str(keys)],key_text),str(execs):block(originals[str(execs)],exec_text)}
 changes={}
 for target,installed in expected.items():
  restore_changes(Path(target).read_text(),originals[target],installed)
  changes[target]={'before':originals[target],'installed':installed}
 allowed=json.loads((BASE/'legacy-artifacts.json').read_text())
 for target,source in [(lib/'spotify.py','spotify.py'),(sidebar/'TickDashboard.qml','TickDashboard.qml')]:
  hashes=set(allowed[source]);hashes.add(hashlib.sha256((BASE/source).read_bytes()).hexdigest())
  description=describe(target)
  if description.get('sha256') not in hashes:raise RuntimeError(f'Unknown or modified legacy artifact: {target}')
 launcher=applications/'com.tickanddone.desktop.desktop'
 if launcher.read_text() not in {launcher_text(binpath),launcher_text(binpath).replace('Name=Task-tick\n','Name=Tick and Done\n').replace(f'Icon={HOME/".local/share/icons/hicolor/512x512/apps/task-tick.png"}\n','Icon=utilities-terminal\n')}:raise RuntimeError('Legacy desktop launcher is modified or not recognized')
 if not binpath.is_symlink() or binpath.resolve()!=binary:raise RuntimeError('Legacy binary link must match the explicitly selected binary')
 artifacts={str(target):{'before':{'kind':'absent'},'installed':describe(target)} for target in [binpath,lib/'spotify.py',sidebar/'TickDashboard.qml',launcher]}
 previous_binary=Path(next(iter(manifest['backups'].values()))).parent/'previous-tick-and-done'
 if previous_binary.is_file():artifacts[str(binpath)]['before']={'kind':'file','sha256':hashlib.sha256(previous_binary.read_bytes()).hexdigest(),'backup':str(previous_binary)}
 return {**manifest,'version':3,'changes':changes,'artifacts':artifacts}

def main():
 p=argparse.ArgumentParser();p.add_argument('--binary',type=Path,required=True);p.add_argument('--uninstall',action='store_true');p.add_argument('--adopt-legacy',action='store_true',help='Confirm verified legacy artifacts belong to this integration');args=p.parse_args()
 config=Path(os.environ.get('XDG_CONFIG_HOME',str(HOME/'.config')));state=Path(os.environ.get('XDG_STATE_HOME',str(HOME/'.local/state')))/'tick-and-done/integration';lib=HOME/'.local/lib/tick-and-done';binpath=HOME/'.local/bin/tick-and-done';sidebar=config/'quickshell/ii/modules/ii/sidebarLeft';content=sidebar/'SidebarLeftContent.qml';keys=config/'hypr/custom/keybinds.lua';execs=config/'hypr/custom/execs.lua'
 if args.uninstall:
  manifest=json.loads((state/'manifest.json').read_text())
  if 'changes' not in manifest:
   raise RuntimeError('Legacy integration backup has no installed snapshot. Preserve current files and review the original backups before uninstalling.')
  restored={target:restore_changes(Path(target).read_text(),change['before'],change['installed']) for target,change in manifest['changes'].items()}
  artifacts=manifest.get('artifacts',{})
  if not artifacts:raise RuntimeError('Artifact snapshots missing; review legacy backups before uninstalling.')
  for target,change in artifacts.items():
   if describe(Path(target))!=change['installed']:
    raise RuntimeError(f'Integration artifact changed; preserve and resolve it before uninstalling: {target}')
   if change['before']['kind']=='file' and not Path(change['before']['backup']).is_file():raise RuntimeError('Original artifact backup is missing')
  for target,value in restored.items():Path(target).write_text(value)
  for target,change in artifacts.items():restore_artifact(Path(target),change['before'])
  (state/'manifest.json').unlink()
  print('Restored backed-up integration files. Other app data is unchanged.');return
 binary=args.binary.resolve();assert binary.is_file(),'Build the desktop binary first';assert content.is_file() and keys.is_file() and execs.is_file(),'Supported Quickshell/Hyprland config not found'
 original=content.read_text();assert 'SidebarDashboard {}' in original or 'TickDashboard {}' in original,'Dashboard integration point changed; inspect before installing'
 previous=json.loads((state/'manifest.json').read_text()) if (state/'manifest.json').exists() else {}
 if previous and 'changes' not in previous and args.adopt_legacy:
  previous=adopt_legacy(previous,content,keys,execs,binpath,lib,sidebar,HOME/'.local/share/applications',binary)
 stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f');backups={};state.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(state,0o700);backupdir=state/stamp;backupdir.mkdir(mode=0o700)
 for target in [content,keys,execs]:
  backup=backupdir/target.name;shutil.copy2(target,backup);backups[str(target)]=str(backup)
 originals={str(target):target.read_text() for target in [content,keys,execs]}
 baselines={}
 for target,before in originals.items():
  prior=previous.get('changes',{}).get(target)
  baselines[target]=restore_changes(before,prior['before'],prior['installed']) if prior else before
 if previous and 'changes' not in previous:
  raise RuntimeError('Legacy integration exists. Review its original backups before upgrading; current configuration was not changed.')
 applications=HOME/'.local/share/applications'
 iconpath=HOME/'.local/share/icons/hicolor/512x512/apps/task-tick.png'
 artifact_paths=[binpath,lib/'spotify.py',sidebar/'TickDashboard.qml',applications/'com.tickanddone.desktop.desktop',iconpath]
 artifact_baselines={}
 for index,target in enumerate(artifact_paths):
  prior=previous.get('artifacts',{}).get(str(target))
  if prior:
   if describe(target)!=prior['installed']:raise RuntimeError(f'Modified generated integration artifact: {target}')
   artifact_baselines[str(target)]=prior['before']
  elif previous and target!=iconpath:raise RuntimeError('Legacy artifact ownership is unknown; review backups before updating.')
  else:artifact_baselines[str(target)]=capture(target,backupdir/f'artifact-{index}')
 lib.mkdir(parents=True,exist_ok=True);binpath.parent.mkdir(parents=True,exist_ok=True);iconpath.parent.mkdir(parents=True,exist_ok=True)
 if binpath.exists() and (not binpath.is_symlink() or binpath.resolve()!=binary):shutil.copy2(binpath,backupdir/'previous-tick-and-done')
 if binpath.exists() or binpath.is_symlink():binpath.unlink()
 binpath.symlink_to(binary);shutil.copy2(BASE/'spotify.py',lib/'spotify.py');shutil.copy2(BASE/'TickDashboard.qml',sidebar/'TickDashboard.qml');shutil.copy2(BASE.parent/'src-tauri/icons/icon.png',iconpath)
 content.write_text(original.replace('SidebarDashboard {}','TickDashboard {}'))
 helper=str(lib/'spotify.py')
 keys.write_text(block(keys.read_text(),f'hl.unbind("SUPER + Space")\nhl.bind("SUPER + Space", hl.dsp.exec_cmd(\'python3 "{helper}" toggle\'), {{description="Spotify: play/pause with quiet startup"}})'))
 execs.write_text(block(execs.read_text(),f'hl.on("hyprland.start", function ()\n    hl.exec_cmd(\'"{binpath}" --background\')\n    hl.exec_cmd(\'python3 "{helper}" watch\')\nend)'))
 applications=HOME/'.local/share/applications';applications.mkdir(parents=True,exist_ok=True)
 (applications/'com.tickanddone.desktop.desktop').write_text(launcher_text(binpath))
 changes={}
 for target,before in originals.items():
  current=Path(target).read_text()
  changes[target]={'before':baselines[target],'installed':current}
 (state/'manifest.json').write_text(json.dumps({'version':3,'backups':previous.get('backups',backups),'changes':changes,'artifacts':{str(target):{'before':artifact_baselines[str(target)],'installed':describe(target)} for target in artifact_paths}},indent=2))
 print(f'Installed integration. Backups: {backupdir}. Existing local todos remain available until desktop sign-in. Reload Hyprland/Quickshell after verifying files.')
if __name__=='__main__':main()
