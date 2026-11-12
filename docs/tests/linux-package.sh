#!/usr/bin/env bash
set -euo pipefail
package=$(realpath "${1:?Usage: linux-package.sh /path/to/Task-tick-linux-x86_64.deb}")
docker run --rm -v "$package:/artifacts/task-tick.deb:ro" ubuntu:24.04 bash -euc '
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq /artifacts/task-tick.deb xvfb dbus-x11 > /tmp/packages.log 2>&1
ldd /usr/bin/tick-and-done > /tmp/libraries
if grep -q "not found" /tmp/libraries; then cat /tmp/libraries; exit 1; fi
export XDG_RUNTIME_DIR=/tmp/task-tick-runtime
mkdir -m 700 "$XDG_RUNTIME_DIR"
export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1
export LIBGL_ALWAYS_SOFTWARE=1 GDK_BACKEND=x11
# WebKit sandbox override is confined to this disposable root container.
dbus-run-session -- xvfb-run -a bash -euc '\''
/usr/bin/tick-and-done --background > /tmp/task-tick.log 2>&1 &
application=$!
trap "kill $application 2>/dev/null || true" EXIT
for attempt in $(seq 1 20); do
 if ! kill -0 "$application" 2>/dev/null; then cat /tmp/task-tick.log; exit 1; fi
 if test -S "$XDG_RUNTIME_DIR/tick-and-done.sock"; then break; fi
 sleep 1
done
response=$(/usr/bin/tick-and-done --ipc "{\"action\":\"state\"}")
case "$response" in *"Open Task-tick and sign in first"*) echo "PASS: Ubuntu24.04 package installs, launches, and serves account-protected native IPC.";; *) printf "%s\n" "$response"; cat /tmp/task-tick.log; exit 1;; esac
'\''
'
