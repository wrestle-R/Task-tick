#!/usr/bin/env python3
"""Quiet Spotify TUI control. Uses the local playback socket, never account keys."""
import argparse,fcntl,json,os,re,socket,stat,subprocess,sys,time,uuid
from pathlib import Path
RUNTIME=Path(os.environ.get('XDG_RUNTIME_DIR',f'/run/user/{os.getuid()}'))
STATE=Path(os.environ.get('XDG_STATE_HOME',str(Path.home()/'.local/state')))/'tick-and-done'
SOCKET=RUNTIME/'spotify-tui/player.sock'
def request(method,params=None,timeout=19):
 ident=uuid.uuid4().hex
 info=SOCKET.stat()
 if info.st_uid!=os.getuid() or not stat.S_ISSOCK(info.st_mode):raise RuntimeError('Playback socket is unavailable')
 with socket.socket(socket.AF_UNIX) as s:
  s.settimeout(timeout);s.connect(str(SOCKET));s.sendall((json.dumps({'version':1,'id':ident,'method':method,'params':params})+'\n').encode());data=bytearray()
  while b'\n' not in data:
   part=s.recv(4096)
   if not part:raise RuntimeError('Playback connection closed')
   data.extend(part)
   if len(data)>262144:raise RuntimeError('Invalid playback response')
  result=json.loads(data.split(b'\n')[0])
  if result.get('id')!=ident or result.get('version')!=1:raise RuntimeError('Playback protocol mismatch')
  if result.get('error'):raise RuntimeError('Spotify did not accept the command. Check the player connection.')
  return result.get('result',{})
def remember(state):
 uri=state.get('uri','')
 if state.get('status') == 'stopped' or not re.fullmatch(r'spotify:track:[a-zA-Z0-9]+',uri):return
 STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
 value={k:state.get(k) for k in ['uri','position_ms','duration_ms','volume','shuffle','repeat','sequence']}
 target=STATE/'last-track.json';temp=STATE/f'.last-track-{os.getpid()}.tmp'
 with open(temp,'w',opener=lambda p,f:os.open(p,f,0o600)) as f:json.dump(value,f)
 os.replace(temp,target)
def toggle():
 STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
 with (RUNTIME/'tick-spotify-toggle.lock').open('w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  try:state=request('state',timeout=2)
  except (OSError,RuntimeError):
   binary=Path.home()/'.local/bin/spotify-tui'
   result=subprocess.run([str(binary),'connect'],capture_output=True,timeout=35)
   if result.returncode:raise RuntimeError('Spotify could not connect. Open the player to check login/provider setup.')
   state={}
  deadline=time.monotonic()+22
  while not state.get('connected') or not state.get('logged_in'):
   if time.monotonic()>deadline:raise RuntimeError('Spotify is not ready. Check login and the network in the player.')
   time.sleep(.2)
   try:state=request('state',timeout=2)
   except (OSError,RuntimeError):continue
  remember(state)
  if not state.get('uri') or state.get('status')=='stopped':
   path=STATE/'last-track.json'
   if not path.exists():raise RuntimeError('Choose a song in Spotify once; there is no previous track to resume.')
   saved=json.loads(path.read_text());uri=saved.get('uri','')
   if not re.fullmatch(r'spotify:track:[a-zA-Z0-9]+',uri):raise RuntimeError('No valid saved track')
   sequence=saved.get('sequence')
   if isinstance(sequence,dict):
    uris=sequence.get('uris',[]);index=sequence.get('index')
    if not isinstance(uris,list) or not 1<=len(uris)<=5000 or not isinstance(index,int) or not 0<=index<len(uris) or any(not isinstance(u,str) or not re.fullmatch(r'spotify:track:[a-zA-Z0-9]+',u) for u in uris) or uris[index]!=uri:raise RuntimeError('Saved playback queue is invalid; open the player to choose a track.')
    request('play_sequence',{'uris':uris,'index':index})
   else:request('play_track',{'uri':uri})
   if isinstance(saved.get('volume'),int) and 0<=saved['volume']<=100:request('set_volume',{'volume':saved['volume']})
   if isinstance(saved.get('shuffle'),bool):request('set_shuffle',{'enabled':saved['shuffle']})
   repeat=saved.get('repeat')
   if repeat in ['off','track','context']:
    if repeat=='track':
     request('repeat_context',{'enabled':False});request('repeat_track',{'enabled':True})
    else:
     request('repeat_track',{'enabled':False});request('repeat_context',{'enabled':repeat=='context'})
   position=max(0,min(int(saved.get('position_ms') or 0),int(saved.get('duration_ms') or 86400000)-1000))
   if position>1000:request('seek',{'position_ms':position})
  else:request('toggle_pause')
  confirmed=request('state');remember(confirmed);return confirmed

def watch():
 with (RUNTIME/'tick-spotify-watch.lock').open('w') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:return
  while True:
   try:remember(request('state',timeout=2))
   except (OSError,ValueError,RuntimeError):pass
   time.sleep(3)
def main():
 parser=argparse.ArgumentParser();parser.add_argument('action',choices=['toggle','watch','state']);args=parser.parse_args()
 try:
  if args.action=='watch':watch()
  else:print(json.dumps(toggle() if args.action=='toggle' else request('state')))
 except (OSError,ValueError,RuntimeError,subprocess.SubprocessError) as e:
  message=str(e);print(json.dumps({'error':message}))
  if args.action=='toggle':subprocess.run(['notify-send','Tick and Done · Spotify',message],check=False)
  return 1
 return 0
if __name__=='__main__':sys.exit(main())
