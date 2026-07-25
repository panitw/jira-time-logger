# Epic 7 — UX/UI Revamp (KKP Design System) — Decision Log

Orchestrated run started **2026-07-25**. Audit trail for every decision made during the
BMAD pipeline (`bmad-story-creator` → `bmad-story-developer` → `bmad-code-reviewer` →
`bmad-story-finisher`) across Epic 7.

**Authoritative specs:**
`_bmad-output/planning-artifacts/ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md`
and `EXPERIENCE.md`. Both win over the reference mockup
(`imports/jira-time-logger.dc.html`) on conflict.

---

## Standing decisions (settled with the owner before the loop)

### SD-1 — Scope: stories 7.2 through 7.9 only
**Decided by:** owner.
7.10 (Settings on the full page) and 7.11 (Inline Jira banner reconciliation) are
**out of scope for this run**. Both surfaces were outside the Claude Design handoff and
their own acceptance criteria require the design to be resolved first via a short
`/bmad-ux` Update run. They stay `backlog`; Epic 7 will **not** be marked `done` at the
end of this run.

### SD-2 — Build order: strict numeric, 7.2 → 7.3 → 7.4 → 7.5 → 7.6 → 7.7 → 7.8 → 7.9
**Decided by:** orchestrator (routine — no conflicting recommendation in `epics.md`).
Numeric order is already dependency-sound: the popup shell (7.2) must exist before the
resume card (7.3) mounts into it; search (7.4) must exist before the "N more assigned
tickets → search" handoff (7.5) can point at it; the shared day-status component (7.6)
must exist before the week totals row (7.7) and matrix rows (7.8) consume it; and popup
states (7.9) decorate surfaces that 7.2–7.6 create. Each story is driven **explicitly by
number** so no agent auto-picks by sprint-status order.

### SD-3 — Checkpoint cadence: run continuously
**Decided by:** owner.
Report after each story; do not pause. Stop only for a genuinely load-bearing design
decision (architecture fork, a11y-regression trade-off, scope/defer call).

### SD-4 — Decision-handling protocol
- **Escalate to the owner:** design/product forks, anything that would regress WCAG 2.1 AA,
  scope-vs-defer trade-offs, deviations from `DESIGN.md` / `EXPERIENCE.md`.
- **Decide and log:** naming, file placement, test shape, which existing seam to reuse,
  forced consequences of an already-settled decision.

### SD-5 — Working-tree hygiene
**Decided by:** owner.
Story 7.1's already-landed output (token foundation + bundled fonts), the Epic 7 section
of `epics.md`, the `sprint-status.yaml` Epic 7 block, and the `ux-designs/` specs were
committed as a **baseline commit** before the loop started.

Epic 6.3's in-flight CRX work (`scripts/pack-crx.mjs`, `scripts/derive-ext-key.mjs`,
`scripts/lib/`, `wxt.config.ts`, `package.json`, `docs/release.md`) is **deliberately left
uncommitted and untouched**. Every finisher in this run gets an explicit file list and must
confirm `git status` shows none of those Epic 6 files staged. **No `git add -A`, ever.**

---

## Baseline established before the loop (2026-07-25)

Verified on the pre-loop tree so no agent can mislabel a regression as pre-existing:

- `pnpm compile` — **clean**, no errors.
- `pnpm test` — **76 test files, 961 passed, 1 skipped (962 total)**.
- **Known pre-existing failure mode:** `pnpm test` exits **non-zero** despite every test
  passing. One unhandled rejection escapes from `components/manager/ManagerView.test.tsx`:
  `TypeError: Cannot read properties of undefined (reading 'runtime')` inside
  `@wxt-dev/storage`'s `getStorageArea` — a fake-browser teardown race, not a product bug.
  **This is the baseline.** Any agent reporting it is reporting a pre-existing condition.
  A *new* failing test, or a change in the 961/1/76 counts, is **not** pre-existing.

Constraints in force for every story in this epic (from `epics.md`):
- No story may regress WCAG 2.1 AA. Status is never colour alone — colour + icon +
  visible text label, always. The `docs/a11y-audit-2026-06-27.md` gate must still pass.
- All icons come from `lucide-react` (already a dependency, declared in `components.json`).
  No second icon set, no icon font, no CDN. Icons are inline SVG at 11–13 px with
  `aria-hidden="true"`; meaning is carried by adjacent text.
- No monospace anywhere. Numbers use the `tabular` utility (Kanit + `tabular-nums`).

---

## Per-story decisions

_Appended as the run proceeds._
