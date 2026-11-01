#!/bin/bash
# Android self-update test (run inside the emulator job of update-test.yml).
# Round 1: the installed app finds a newer build, downloads it and installs it; Android asks once (we tap "Update").
# Round 2: the app now owns its updates, so the next update installs with no question at all.
set -u
FEED="http://10.0.2.2:8000/update.json"
ACT="$PKG/com.martinb.shell.MainActivity"
python3 -m http.server 8000 --directory feed >/dev/null 2>&1 &

updated() { adb shell dumpsys package "$PKG" | grep -m1 lastUpdateTime | tr -d '\r'; }
installer() { adb shell dumpsys package "$PKG" | grep -m1 -o "installerPackageName=[^ ]*" | tr -d '\r'; }
wait_log() { for i in $(seq "$2"); do adb logcat -d -s MBUpdate:* | grep -q "$1" && return 0; sleep 2; done; return 1; }
tap_text() {
  for i in $(seq 30); do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1
    XY=$(python3 - "$1" <<'PY'
import re, sys
xml = open("ui.xml", encoding="utf-8", errors="ignore").read()
for m in re.finditer(r'<node [^>]*>', xml):
    n = m.group(0)
    t = re.search(r' text="([^"]*)"', n); b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
    if t and b and re.fullmatch(sys.argv[1], t.group(1).strip(), re.I):
        x1, y1, x2, y2 = map(int, b.groups()); print((x1 + x2) // 2, (y1 + y2) // 2); break
PY
)
    if [ -n "$XY" ]; then adb exec-out screencap -p > android-confirm.png; adb shell input tap $XY; echo "tapped $1 at $XY"; return 0; fi
    sleep 2
  done
  return 1
}

adb install -r app.apk || exit 1
adb shell appops set "$PKG" REQUEST_INSTALL_PACKAGES allow
echo "installed: $(updated) $(installer)" | tee android-result.txt

# ---- Round 1
adb logcat -c
T0=$(updated)
adb shell am start -n "$ACT" --es mbUpdateUrl "$FEED" --ez mbUpdateAuto true
wait_log "downloaded build" 90 || { adb logcat -d -s MBUpdate:* | tee -a android-result.txt; echo "FAIL: no download" | tee -a android-result.txt; exit 1; }
sleep 1; adb exec-out screencap -p > android-update-ready.png
wait_log "installing" 30 || { echo "FAIL: install not started" | tee -a android-result.txt; exit 1; }
tap_text "(Update|Install|Mettre à jour|Installer)" || echo "no confirm screen found" | tee -a android-result.txt
for i in $(seq 60); do [ "$(updated)" != "$T0" ] && break; sleep 2; done
adb logcat -d -s MBUpdate:* | tee -a android-result.txt
T1=$(updated)
[ "$T1" != "$T0" ] || { echo "FAIL round 1: app not updated" | tee -a android-result.txt; exit 1; }
echo "Round 1 OK: updated ($T1), $(installer)" | tee -a android-result.txt
[ "$(installer)" = "installerPackageName=$PKG" ] || { echo "FAIL: app is not the owner of its updates" | tee -a android-result.txt; exit 1; }

# ---- Round 2: must be silent (no tap)
sleep 3
adb logcat -c
adb shell am start -n "$ACT" --es mbUpdateUrl "$FEED" --ez mbUpdateAuto true
wait_log "installing .* silently" 90 || { adb logcat -d -s MBUpdate:* | tee -a android-result.txt; echo "FAIL round 2: not silent" | tee -a android-result.txt; exit 1; }
for i in $(seq 60); do [ "$(updated)" != "$T1" ] && break; sleep 2; done
adb logcat -d -s MBUpdate:* | tee -a android-result.txt
[ "$(updated)" != "$T1" ] || { echo "FAIL round 2: app not updated" | tee -a android-result.txt; exit 1; }
adb logcat -d -s MBUpdate:* | grep -q "install status -1" && { echo "FAIL round 2: Android asked the user" | tee -a android-result.txt; exit 1; }
echo "Round 2 OK: silent update ($(updated))" | tee -a android-result.txt
