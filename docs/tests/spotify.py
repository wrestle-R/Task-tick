import importlib.util,json,stat,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("spotify",Path(__file__).resolve().parents[2]/"desktop/hyprland/spotify.py")
spotify=importlib.util.module_from_spec(spec);spec.loader.exec_module(spotify)
class Recovery(unittest.TestCase):
 def test_stopped_engine_cannot_overwrite_saved_position(self):
  with tempfile.TemporaryDirectory() as folder:
   spotify.STATE=Path(folder)
   spotify.remember({"uri":"spotify:track:abc123","status":"playing","position_ms":42000})
   spotify.remember({"uri":"spotify:track:abc123","status":"stopped","position_ms":0})
   saved=spotify.STATE/"last-track.json"
   self.assertEqual(json.loads(saved.read_text())["position_ms"],42000)
   self.assertEqual(stat.S_IMODE(saved.stat().st_mode),0o600)
if __name__=="__main__":unittest.main()
