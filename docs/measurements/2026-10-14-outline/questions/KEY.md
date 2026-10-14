# Grading key (written before generating docs, 2026-10-14)
q3 (comments.pin, real-time) — the non-obvious invariant:
- Persist through the ctx-aware helpers (`saveWithCtx` / `updateWithCtx` / `createWithCtx`, server/models/base/Model.ts). They attach the request context and `event.publish`, which creates the Event that processors consume. A plain `save()` works and passes a quick test, but no event → other connected users never see the pin.
- The new event name must be typed in `server/types.ts` and handled in `server/queues/processors/WebsocketsProcessor.ts` (existing `comments.update`/reactions cases) or the broadcast never happens.
- Also expected but already in outline's own AGENTS.md: policy ability in `server/policies/`, validation schema, presenter, migration, transaction.
Score: plan names the *WithCtx helper (or explicitly says the save must carry ctx to emit the event) AND WebsocketsProcessor.
