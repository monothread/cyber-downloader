#!/bin/sh
# Throwaway checks of what the anime section assumes of BusyBox for Windows. Run by busybox.exe, in the same kind of
# isolated environment the app uses. Prints facts; it does not stop at the first failure.
echo "== uname"; uname -a
echo "== applets"
for c in sh sed grep cut head tail tr wc sort od base64 printf mkdir rm cat date nl cp mv uname sleep; do
    if command -v "$c" >/dev/null 2>&1; then echo "ok      $c"; else echo "MISSING $c"; fi
done
echo "== executables on Path (exe lookup)"
for c in yt-dlp ffmpeg curl; do echo "$c -> $(command -v $c 2>&1)"; done
echo "== versions"
curl --version 2>&1 | head -1
yt-dlp --version 2>&1 | head -1
echo "== functions"
f_ok() { echo function-ok; }
command -v f_ok
echo "hyphen function name:"
( eval 'foo-bar() { echo hyphen-ok; }; foo-bar' ) 2>&1 || echo "hyphen function name NOT accepted"
echo "function found by command -v inside \$(... | ...):"
pw_menu() { while IFS= read -r l; do printf 'got %s\n' "$l" >&2; done; return 1; }
x=$(printf '1 A\n2 B\n' | pw_menu 'p' 2>&1; echo "status=$?")
echo "$x"
echo "== forward-slash path and /dev/null"
mkdir -p "$TEMP/pw-spike/with space" && echo "mkdir ok" ; echo hi > "$TEMP/pw-spike/with space/a.txt" && cat "$TEMP/pw-spike/with space/a.txt"
echo x > /dev/null && echo "/dev/null ok"
echo "== TLS through curl (Schannel)"
curl -sS -o /dev/null -w 'status=%{http_code}\n' https://github.com 2>&1
