#!/bin/sh
# Runs ani-cli with stand-ins for what it expects to find on a desktop: a menu program, a player and tput. They are shell
# functions instead of files, so nothing has to be on PATH or executable, which is what makes this work the same under
# BusyBox on Linux and on Windows.
#
#   busybox sh pullwave-run.sh <path of ani-cli> [ani-cli arguments...]
#
# pullwave_menu: ani-cli hands the choices to its menu program on stdin, one per line, with the prompt as the last
# argument. Each choice is reported on stderr (ani-cli captures stdout, not stderr) as PULLWAVE_MENU<TAB>prompt<TAB>line,
# and the function fails so ani-cli stops right after listing.
pullwave_menu() {
    for prompt; do :; done
    while IFS= read -r line; do
        printf 'PULLWAVE_MENU\t%s\t%s\n' "$prompt" "$line" >&2
    done
    return 1
}

# ani-cli refuses to start without a player (mpv or vlc), even to download. Pullwave never plays through it.
pullwave_noplayer() {
    return 0
}

# ani-cli moves the cursor with tput for cosmetic reasons; there is no terminal here.
tput() {
    return 0
}

script="$1"
shift
. "$script"
