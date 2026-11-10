#!/usr/bin/env python3
"""Install reversible integration into an existing illogical-impulse Quickshell setup."""
from pathlib import Path
import argparse,datetime,json,os,shutil,subprocess
HOME=Path.home();BASE=Path(__file__).resolve().parent
START='-- Tick and Done integration START';END='-- Tick and Done integration END'
def block(source,text):
 if START in source:
  before,rest=source.split(START,1);_,after=rest.split(END,1);return before+START+'\n'+text+'\n'+END+after
 return source.rstrip()+'\n\n'+START+'\n'+text+'\n'+END+'\n'
def main():
 p=argparse.ArgumentParser();p.add_argument('--binary',type=Path,required=True);p.add_argument('--uninstall',action='store_true');args=p.parse_args()
 config=Path(os.environ.get('XDG_CONFIG_HOME',str(HOME/'.config')));state=Path(os.environ.get('XDG_STATE_HOME',str(HOME/'.local/state')))/'tick-and-done/integration';lib=HOME/'.local/lib/tick-and-done';binpath=HOME/'.local/bin/tick-and-done';sidebar=config/'quickshell/ii/modules/ii/sidebarLeft';content=sidebar/'SidebarLeftContent.qml';keys=config/'hypr/custom/keybinds.lua';execs=config/'hypr/custom/execs.lua'
 if args.uninstall:
  manifest=json.loads((state/'manifest.json').read_text())
  for target,backup in manifest['backups'].items():shutil.copy2(backup,target)
  print('Restored backed-up integration files. Other app data is unchanged.');return
 binary=args.binary.resolve();assert binary.is_file(),'Build the desktop binary first';assert content.is_file() and keys.is_file() and execs.is_file(),'Supported Quickshell/Hyprland config not found'
 original=content.read_text();assert 'SidebarDashboard {}' in original or 'TickDashboard {}' in original,'Dashboard integration point changed; inspect before installing'
 stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S');backups={};state.mkdir(parents=True,exist_ok=True);backupdir=state/stamp;backupdir.mkdir()
 for target in [content,keys,execs]:
  backup=backupdir/target.name;shutil.copy2(target,backup);backups[str(target)]=str(backup)
 (state/'manifest.json').write_text(json.dumps({'backups':backups},indent=2))
 lib.mkdir(parents=True,exist_ok=True);binpath.parent.mkdir(parents=True,exist_ok=True)
 if binpath.exists() and (not binpath.is_symlink() or binpath.resolve()!=binary):shutil.copy2(binpath,backupdir/'previous-tick-and-done')
 if binpath.exists() or binpath.is_symlink():binpath.unlink()
 binpath.symlink_to(binary);shutil.copy2(BASE/'spotify.py',lib/'spotify.py');shutil.copy2(BASE/'TickDashboard.qml',sidebar/'TickDashboard.qml')
 content.write_text(original.replace('SidebarDashboard {}','TickDashboard {}'))
 helper=str(lib/'spotify.py')
 keys.write_text(block(keys.read_text(),f'hl.unbind("SUPER + Space")\nhl.bind("SUPER + Space", hl.dsp.exec_cmd(\'python3 "{helper}" toggle\'), {{description="Spotify: play/pause with quiet startup"}})'))
 execs.write_text(block(execs.read_text(),f'hl.on("hyprland.start", function ()\n    hl.exec_cmd(\'"{binpath}" --background\')\n    hl.exec_cmd(\'python3 "{helper}" watch\')\nend)'))
 applications=HOME/'.local/share/applications';applications.mkdir(parents=True,exist_ok=True)
 (applications/'com.tickanddone.desktop.desktop').write_text(f'[Desktop Entry]\nType=Application\nName=Tick and Done\nComment=Todos and your watchlist, within reach\nExec="{binpath}"\nIcon=utilities-terminal\nTerminal=false\nCategories=Office;Utility;\nStartupWMClass=com.tickanddone.desktop\n')
 print(f'Installed integration. Backups: {backupdir}. Existing local todos remain available until desktop sign-in. Reload Hyprland/Quickshell after verifying files.')
if __name__=='__main__':main()
