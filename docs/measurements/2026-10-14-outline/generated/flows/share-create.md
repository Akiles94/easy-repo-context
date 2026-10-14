# Flow: share-create
Summary: shares.create → team `createShare` check → find-or-create unrevoked share → publish checks on stored share
Trigger: `server/routes/api/shares/shares.ts` (RPC `shares.create`)
Path:
1. `server/routes/api/shares/shares.ts` — `authorize(user, "createShare", user.team)`.
2. `server/routes/api/shares/shares.ts` — loads the collection or document scoped to `userId`; missing → `NotFoundError`; `authorize(user, "read", ...)` on each.
3. `server/routes/api/shares/shares.ts` — `Share.findOrCreateWithCtx()` keyed on collection or document, team, and `revokedAt: null`; the request fields are `defaults` only.
4. `server/routes/api/shares/shares.ts` — when the returned share is `published`, authorizes `share` on team, document and collection.
5. `server/routes/api/shares/shares.ts` — `presentShare()` and policies in the response.
Side effects: shares row created when none is active; no collaboration or queue work in this handler.
Gotchas: see `.context/gotchas.md` under `server/routes/api/shares`.
Related: `server/routes/api/shares/shares.ts` (RPC `shares.update` changes an existing share)
