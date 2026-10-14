#!/usr/bin/env bash
S=$(dirname "$0")
jobs=()
for rep in 1 2; do for q in 1 2 3 4; do for c in S H; do jobs+=("$c q$q r$rep"); done; done; done
printf '%s\n' "${jobs[@]}" | xargs -P 4 -L 1 bash -c 'c=$0; q=$1; r=$2; "'$S'/run.sh" "'$S'/$c" claude-sonnet-5-5 "'$S'/q/$q.txt" "'$S'/out/$c-$q-$r.json"; echo "done $c $q $r"'
