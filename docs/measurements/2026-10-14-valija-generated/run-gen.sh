#!/usr/bin/env bash
# usage: run-gen.sh <workdir> <model> <out-json>
set -u
X=$(dirname "$0")
cd "$1"
PROMPT="$("$X/bin/ctxmap" prompt init --auto)"
env -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_REMOTE_SESSION_ID -u CLAUDE_CODE_MESSAGING_SOCKET \
  -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_SYNC_SESSION_REFS -u CLAUDE_CODE_SYNC_PLUGINS \
  -u CLAUDE_CODE_SYNC_SKILLS -u CLAUDE_CODE_TEE_SDK_STDOUT -u CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2 \
  -u CLAUDE_ADDITIONAL_DIRECTORIES -u CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD -u CLAUDECODE \
  -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_DIAGNOSTICS_FILE -u CLAUDE_CODE_INCLUDE_PARTIAL_MESSAGES \
  -u CLAUDE_AFTER_LAST_COMPACT -u CLAUDE_PID -u CLAUDE_CODE_SESSION_ATTENDED PATH="$X/bin:$PATH" \
  claude -p "$PROMPT" --model "$2" --output-format json --session-id "$(cat /proc/sys/kernel/random/uuid)" \
    --allowedTools "Read" "Grep" "Glob" "Write" "Edit" "Bash(ctxmap:*)" "Bash(git log:*)" "Bash(git show:*)" "Bash(ls:*)" "Bash(cat:*)" "Bash(find:*)" "Bash(grep:*)" "Bash(head:*)" "Bash(wc:*)" \
    --disallowedTools "WebFetch" "WebSearch" \
  < /dev/null > "$3" 2> "$3.err"
