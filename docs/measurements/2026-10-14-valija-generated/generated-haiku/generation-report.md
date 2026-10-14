I wrote the context docs under `.context/` and they pass `ctxmap check` (9 of 9 fresh, 0 broken). No source code was touched and nothing is committed.

**Files**
- `.context/overview.md`: components, data stores, boundaries. Existing docs are linked by path, not restated.
- `.context/gotchas.md`: 16 bullets, each with the rule, what breaks, a code ref, and evidence (a commit or a code comment).
- `.context/flows/`: `save-context`, `unlock-vault`, `import-conversations`, `relocate-vault`, `desktop-ipc-call`.
- `.context/presentation.md`, `AGENTS.md`, and a 4-line pointer block appended to the root `CLAUDE.md`. These came from `ctxmap index`, which the tool's contract says to run. The `CLAUDE.md` change is the only existing file touched.

**Flows chosen.** The candidates ranked the CLI, MCP server, and desktop IPC highest. I picked flows with distinct mechanisms and side effects:
- `save-context` covers the write path and lineage bump.
- `unlock-vault` covers key handling, the schema gate, and fork detection.
- `import-conversations` covers the batch write and deterministic ids.
- `relocate-vault` covers the verify-before-remove order and the client re-point.
- `desktop-ipc-call` covers the channel contract.

I skipped the MCP read tools (`get_context`, `search_context`) because they add little beyond `save-context`.

**Gotcha evidence.** The fix-commit data was thin: only one hotspot file, with two fixes. Most gotchas therefore rest on code comments that I opened and read in context. One gotcha rests on a commit (`8fd3bd9`, the platform path module). I did not read the advance review or decision files in depth.

**Left out, and why**
- **Import re-run un-archiving items:** the upsert overwrites `archived`, but `archive()` has no caller yet. It will matter once it gets one.
- **Telemetry ban:** a test already enforces it.
- **Migration on every session open:** I saw `openRepositories` calls `migrate` each time, but I did not verify whether that creates a risk, so I left it out.

Nothing is committed. Say if you want a commit.
