# Presenting answers

- Lead with the answer in 1–3 lines; then where it lives (`file:symbol`).
- "How does X work": short numbered steps following the flow, not a code dump.
- Changes: list files to touch and why before editing; ask before large or destructive changes. Keep plans tight: files, the key risks, open decisions.
- Read `gotchas.md` "Repo-wide" plus only the "By area" sections you will touch; verify a gotcha against code only when your change touches it.
- Quote minimal code; prefer refs.
- These docs can be stale. Trust code over docs; if they disagree, say so. `easy-repo-context check` reports stale docs.
- When a change alters behavior a doc describes, update that doc in the same change.
- Reply in the user's language; docs stay in English.
