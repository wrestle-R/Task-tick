#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  printf '%s\n' 'Native downloads currently target Linux x86_64. On macOS/Windows use https://task-tick-beige.vercel.app/app'
  exit 1
fi
command -v python3 >/dev/null || { printf '%s\n' 'Install Python 3 and try again.'; exit 1; }
python3 - <<'PY'
import hashlib,json,os,pathlib,shlex,tempfile,urllib.request
base='https://api.github.com/repos/wrestle-R/Task-tick/releases/latest'
def get(url):
    request=urllib.request.Request(url,headers={'Accept':'application/vnd.github+json','User-Agent':'Task-tick-installer'})
    return urllib.request.urlopen(request,timeout=60)
try:
    with get(base) as response: release=json.load(response)
except Exception:
    raise SystemExit('No published Task-tick release is available, or GitHub could not be reached. See https://task-tick-beige.vercel.app/downloads')
assets={a['name']:a['browser_download_url'] for a in release['assets']}
name='Task-tick-linux-x86_64.AppImage'
if name not in assets or 'SHA256SUMS' not in assets:raise SystemExit('This release has no complete Linux download yet.')
for url in assets.values():
    if not url.startswith('https://github.com/wrestle-R/Task-tick/releases/download/'):raise SystemExit('Untrusted download URL')
with get(assets['SHA256SUMS']) as response:sums=response.read().decode()
expected=next((line.split()[0] for line in sums.splitlines() if line.split()[-1].lstrip('*')==name),None)
if not expected or len(expected)!=64:raise SystemExit('Missing release checksum')
home=pathlib.Path.home();directory=home/'.local/share/task-tick';directory.mkdir(parents=True,exist_ok=True)
with tempfile.NamedTemporaryFile(dir=directory,delete=False) as output:
    temporary=pathlib.Path(output.name)
    try:
        digest=hashlib.sha256();total=0
        with get(assets[name]) as response:
            while chunk:=response.read(65536):
                total+=len(chunk)
                if total>350*1024*1024:raise RuntimeError('Download exceeds expected size')
                digest.update(chunk);output.write(chunk)
        output.flush();os.fsync(output.fileno())
        if digest.hexdigest()!=expected:raise RuntimeError('Checksum verification failed')
        temporary.chmod(0o755);temporary.replace(directory/'Task-tick.AppImage')
    finally:temporary.unlink(missing_ok=True)
binpath=home/'.local/bin';binpath.mkdir(parents=True,exist_ok=True)
launcher=binpath/'task-tick'
launcher.write_text('#!/bin/sh\nexport APPIMAGE_EXTRACT_AND_RUN=1\nexec '+shlex.quote(str(directory/'Task-tick.AppImage'))+' "$@"\n');launcher.chmod(0o755)
applications=home/'.local/share/applications';applications.mkdir(parents=True,exist_ok=True)
# Desktop Exec quoting follows the desktop-entry spec rather than shell quoting.
executable=str(launcher).replace('\\','\\\\').replace('"','\\"').replace('`','\\`').replace('$','\\$')
(applications/'com.tickanddone.desktop.desktop').write_text('[Desktop Entry]\nType=Application\nName=Task-tick\nComment=Your todos and watchlist\nExec="'+executable+'"\nTerminal=false\nCategories=Office;Utility;\n')
print('Installed Task-tick '+release['tag_name']+'. Open it from your application launcher or run '+str(launcher)+'.')
print('Future AppImage updates appear inside the app. Rerunning this installer also updates it without removing your lists.')
PY
