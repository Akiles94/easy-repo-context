I wrote the context docs under `.context/`, and `ctxmap check` passes with 9 docs fresh and 0 broken refs. `ctxmap index` and `ctxmap stamp` ran too.

**Files written**
- `.context/overview.md`
- `.context/gotchas.md` (15 bullets)
- Five flows in `.context/flows/`:
  - `mcp-save-context.md`
  - `vault-unlock-and-session.md`
  - `import-conversations.md`
  - `desktop-ipc-request.md`
  - `relocate-vault.md`
- `ctxmap index` added `.context/presentation.md` and `AGENTS.md`, and appended a pointer block to `CLAUDE.md`. `CLAUDE.md` is now modified; the rest of its text is unchanged.

**Why these flows**
- The candidate list was short (CLI, MCP and desktop IPC entry points), so I traced one behavior per distinct mechanism.
- `mcp-save-context` covers the write path: keychain-gated session, idle auto-lock, one transaction with the lineage bump.
- `vault-unlock-and-session` covers the schema-upgrade gate and fork detection.
- `import-conversations` is the one path that mints `imported` items with deterministic ids.
- `desktop-ipc-request` covers the validated channel boundary where only error codes cross.
- `relocate-vault` covers the multi-step move with rollback and re-pointing of third-party configs.

**Left out or uncertain**
- The context pack and search read paths have no flow of their own. Their rules are in `gotchas.md` instead.
- I didn't trace the sync and doctor flows beyond what `docs/sync.md` already covers.
- Git history was shallow, with only two real fix hotspots. Evidence is cited only for commits `2fcf51f` and `8fd3bd9`; the other rules rest on code comments and the `docs/vault-format.md` contract.
- I did not read `src/vault/infra/file-vault-folder.ts` or `desktop/src/main/ipc/schemas.ts`. I dropped a draft gotcha about conflicted-copy detection that depended on the first, and the flow docs only mention the second.

The first attempt to write everything in one shell command timed out and wrote nothing. I redid it file by file with the Write tool.
