import importlib.util,json,stat,tempfile,unittest
from unittest.mock import patch
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
 def test_cold_recovery_restores_queue_offset_options_and_position(self):
  with tempfile.TemporaryDirectory() as folder,patch.object(spotify,'STATE',Path(folder)),patch.object(spotify,'RUNTIME',Path(folder)):
   sequence={'uris':['spotify:track:aaa','spotify:track:bbb'],'index':1}
   saved={'uri':'spotify:track:bbb','status':'playing','position_ms':42000,'duration_ms':180000,'volume':35,'shuffle':False,'repeat':'track','sequence':sequence}
   spotify.remember(saved);calls=[]
   def request(method,params=None,timeout=19):
    calls.append((method,params))
    if method=='state':return dict(saved,connected=True,logged_in=True,status='stopped' if len(calls)==1 else 'playing')
    return {}
   with patch.object(spotify,'request',request):result=spotify.toggle()
   self.assertIn(('play_sequence',sequence),calls)
   self.assertIn(('seek',{'position_ms':42000}),calls)
   self.assertLess(calls.index(('repeat_context',{'enabled':False})),calls.index(('repeat_track',{'enabled':True})))
   self.assertEqual(result['status'],'playing')
 def test_invalid_saved_queue_is_not_dispatched(self):
  with tempfile.TemporaryDirectory() as folder,patch.object(spotify,'STATE',Path(folder)),patch.object(spotify,'RUNTIME',Path(folder)):
   spotify.remember({'uri':'spotify:track:aaa','status':'paused','sequence':{'uris':['not-a-track'],'index':0}})
   with patch.object(spotify,'request',return_value={'connected':True,'logged_in':True,'status':'stopped'}) as request:
    with self.assertRaisesRegex(RuntimeError,'queue is invalid'):spotify.toggle()
    self.assertEqual(request.call_count,1)
if __name__=="__main__":unittest.main()
