The context docs are written and validated: `ctxmap check` reports 9 docs fresh, 0 changed, 0 broken. I did not commit anything.

**Files**
- `.context/overview.md`: components, data stores, boundaries.
- `.context/gotchas.md`: 17 bullets, 5 repo-wide, the rest grouped under vault, context and desktop.
- `.context/flows/`: five flows, `unlock-vault`, `save-context`, `get-context-pack`, `import-conversations`, `desktop-ipc-call`.
- `ctxmap index` also wrote `.context/presentation.md` and `AGENTS.md`, and appended a pointer block to `CLAUDE.md`. That is the tool's documented behavior, but it is a change outside `.context/`, so you should know about it.

**Flows chosen**
- `unlock-vault`: shared by the CLI and desktop, and it carries the upgrade gate, fork detection and the keychain write.
- `save-context`: the main MCP write path, with the transaction and lineage bump.
- `get-context-pack`: the read-side counterpart, to show what does not write.
- `import-conversations`: the importer-to-context write, with deterministic IDs.
- `desktop-ipc-call`: the cross-cutting renderer-to-core boundary.

I skipped `list_projects`, `search_context` and the other CRUD-like routes because they work like the chosen flows.

**Gotchas that the evidence supports**
- The approval and review hooks gate implementation edits and push/merge.
- Every write must go through `session.write()` so the lineage bump is atomic.
- Behind-schema vaults must not be migrated before confirmation.
- Desktop channels need four coordinated edits, and errors cross IPC as codes only.
- Import IDs must stay stable or re-imports duplicate history.
- Commit 200f432 supplied the workspace-reset and tour `finally` rules, and cb6145f supplied the root-deps CI rule.

**Left out**
- The `diagnostics.tsx` fix hotspot. Both commits are styling and severity changes, which the skip rule excludes.
- The `docs/vault-format.md` §11 line that says migration is "a desktop-only ritual, permanently". The CLI migrates silently on unlock (`upgradeConfirmed: true`). I scoped that doc's rule to a future mobile reader rather than repeating it, but the two disagree and you may want to reconcile them.
- A `PRAGMA journal_mode` claim from the same doc. I did not find it in `src/shared/infra/sqlite.ts`, so I did not include it.
