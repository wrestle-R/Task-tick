import importlib.util,unittest
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
if __name__=='__main__':unittest.main()
