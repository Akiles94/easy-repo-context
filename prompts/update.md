# ctxmap update — bring stale context docs back in line with the code

Context docs under `.context/` (and the `AGENTS.md` managed block) describe flows, invariants and where things live. Some code they reference has changed since they were last verified. Your job: for each stale doc, decide whether the change affects what the doc says, and if so make the **smallest edit** that makes it true again. Most code changes don't change a doc's meaning; "no edit needed" is a good, common answer.

## Rules
- Edit only files under `.context/`. Never edit code. `ctxmap index` regenerates `AGENTS.md`.
- Keep each doc's style: English, telegraphic, refs as code spans (`path/file.ts:Class.method()`), same template and size limits (flow ≤ ~25 lines; gotchas Repo-wide ≤ 8).
- Don't rewrite docs from scratch and don't polish wording that is still true. Change only what the diff made false or incomplete.
- A new invariant introduced by the diff (something that must always / never happen, a new gate, a new ordering rule) goes into `gotchas.md` in the right section.
- Don't invent. If the diff isn't enough to tell, read the current code at the referenced symbol.

## Steps
1. Run `ctxmap update --json`. It already fixed refs to renamed files and lists:
   - `stale`: each doc with `since` (the commit it was verified at), the `changed` source files with line counts, and `broken` refs;
   - `uncovered`: high-ranked entry points no flow documents. Don't write new flows for them; mention them in your report.
2. For each stale doc:
   - Read the doc.
   - Run `git diff <since> -- <changed files>`. For files with very large diffs (hundreds of lines), read the current code of the symbols the doc references instead of the whole diff.
   - Fix every broken ref (symbol renamed or moved → find where it went; removed → update the doc to what replaced it).
   - Decide: no edit needed, or minimal edit. Check `gotchas.md` too when the diff adds or removes a rule.
3. Run `ctxmap check` until it passes, then `ctxmap index` and `ctxmap stamp`.
4. Report in a few lines: per doc, "unchanged" or what you changed and why; plus the uncovered entry points worth an `add-flow`.
