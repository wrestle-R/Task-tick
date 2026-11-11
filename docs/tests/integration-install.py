import importlib.util,unittest,tempfile,os,sys,json
from unittest.mock import patch
from pathlib import Path
spec=importlib.util.spec_from_file_location('installer',Path(__file__).resolve().parents[2]/'desktop/hyprland/install.py')
installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
class Restore(unittest.TestCase):
 def test_unrelated_later_edits_survive(self):
  before='existing\n';installed=installer.block(before,'managed command')
  current=installed+'new personal binding\n'
  self.assertEqual(installer.restore_changes(current,before,installed),before+'new personal binding\n')
 def test_modified_managed_section_is_rejected(self):
  before='existing\n';installed=installer.block(before,'managed command')
  with self.assertRaises(RuntimeError):installer.restore_changes(installed.replace('managed command','my replacement'),before,installed)
 def test_sidebar_replacement_preserves_other_content(self):
  before='SidebarDashboard {}\nother\n';installed=before.replace('SidebarDashboard','TickDashboard')
  self.assertEqual(installer.restore_changes(installed+'new content\n',before,installed),before+'new content\n')
class Lifecycle(unittest.TestCase):
 def setup_tree(self,root):
  config=root/'.config';sidebar=config/'quickshell/ii/modules/ii/sidebarLeft';sidebar.mkdir(parents=True)
  content=sidebar/'SidebarLeftContent.qml';content.write_text('SidebarDashboard {}\n')
  custom=config/'hypr/custom';custom.mkdir(parents=True)
  (custom/'keybinds.lua').write_text('-- personal keys\n');(custom/'execs.lua').write_text('-- personal startup\n')
  binary=root/'built-app';binary.write_text('fixture binary')
  return config,content,binary
 def run_installer(self,root,config,binary,uninstall=False):
  with patch.object(installer,'HOME',root),patch.dict(os.environ,{'XDG_CONFIG_HOME':str(config),'XDG_STATE_HOME':str(root/'.state')}),patch.object(sys,'argv',['install','--binary',str(binary)]+(['--uninstall'] if uninstall else [])):
   installer.main()
 def test_install_reinstall_uninstall_preserves_user_data_and_edits(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);config,content,binary=self.setup_tree(root)
   helper=root/'.local/lib/tick-and-done/spotify.py';helper.parent.mkdir(parents=True);helper.write_text('previous personal helper')
   self.run_installer(root,config,binary)
   content.write_text(content.read_text()+'// later user addition\n')
   self.run_installer(root,config,binary)
   self.run_installer(root,config,binary,True)
   self.assertEqual(content.read_text(),'SidebarDashboard {}\n// later user addition\n')
   self.assertEqual(helper.read_text(),'previous personal helper')
   self.assertFalse((root/'.local/bin/tick-and-done').is_symlink())
   self.assertFalse((content.parent/'TickDashboard.qml').exists())
   self.assertFalse((root/'.local/share/applications/com.tickanddone.desktop.desktop').exists())
 def test_modified_artifact_aborts_before_configuration_changes(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);config,content,binary=self.setup_tree(root)
   self.run_installer(root,config,binary)
   before=content.read_text();helper=root/'.local/lib/tick-and-done/spotify.py';helper.write_text('user modification')
   with self.assertRaises(RuntimeError):self.run_installer(root,config,binary,True)
   self.assertEqual(content.read_text(),before)
   self.assertEqual(helper.read_text(),'user modification')
if __name__=='__main__':unittest.main()
