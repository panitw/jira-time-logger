/**
 * The popup's cold-open loading body (Story 7.9, AC1). A FIXED skeleton
 * shape (design source `imports/jira-time-logger-round2.dc.html:569-587`) —
 * never derived from `resume.status`, the entries count, or anything else
 * that itself has to resolve first (NFR1: a skeleton that waits on data to
 * decide its shape reintroduces the wait the state exists to remove).
 *
 * Occupies the resume card's slot. The `-mt-[10px]` baseline break lives on
 * `<main>` ONLY (Obligation 2 / D-7.3-3 / D-7.9-16 — never duplicated onto an
 * individual card), exactly like `ResumeCard.tsx`'s own pre-existing loading
 * branch (which also carries no self `-mt-[10px]`, but DOES carry
 * `relative z-[1]` — mirrored here) — `breaksHeaderBaseline` covers
 * `'loading'` for free (`App.tsx`), so the `'loading'` → real body
 * transition never double-shifts the layout.
 *
 * `animate-skeleton` only — no `animate-spin`, no `LoaderCircle` anywhere in
 * this file (AC1: "no spinner is rendered anywhere"). Colours reuse the
 * EXISTING `bg-border`/`bg-primary-soft` tokens (the same ones
 * `ResumeCard.tsx`'s own pre-existing skeleton branch already uses) rather
 * than inlining the mockup's several near-white greys that have no token —
 * jsdom cannot prove pixel-level shading anyway, and the codebase's own
 * skeleton convention is already token-based, not hex-precise.
 *
 * Review Finding 16 / 24(a): the design source is TWO SIBLING blocks — the
 * raised card (`:570-579`) and a separate `margin-top:16px` block below it
 * (`:580-586`) — not one collapsed card. Restored here: the card holds
 * exactly THREE skeleton lines (`:571-573` — a title line plus a two-line
 * paragraph; the count in this file's own comment history said "4", which
 * was a miscount) and the button row in the SOURCE's order (`52, 52,
 * flex:1`, `:575-577`), and the second block holds THREE 44px list bars
 * (`:583-585`), not two.
 */

const BAR = 'animate-skeleton rounded';

export function PopupSkeletonBody(): React.ReactElement {
  return (
    <div aria-hidden="true" className="relative z-[1]">
      <div className="flex flex-col gap-[10px] rounded-lg border border-border bg-surface p-4 shadow-raised">
        <div className={`h-[12px] w-[78px] ${BAR} bg-primary-soft`} />
        <div className="flex flex-col gap-[3px]">
          <div className={`h-[14px] w-full ${BAR} bg-border`} />
          <div className={`h-[14px] w-[62%] ${BAR} bg-border`} />
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`h-[32px] w-[52px] ${BAR} rounded-md bg-border`} />
          <div className={`h-[32px] w-[52px] ${BAR} rounded-md bg-border`} />
          <div className={`h-[32px] flex-1 ${BAR} rounded-md bg-border`} />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <div className={`h-[36px] w-full ${BAR} rounded-lg bg-border`} />
        <div className={`h-[11px] w-[104px] ${BAR} bg-primary-soft`} />
        <div className="flex flex-col gap-1">
          <div className={`h-[44px] w-full ${BAR} rounded-md bg-border`} />
          <div className={`h-[44px] w-full ${BAR} rounded-md bg-border`} />
          <div className={`h-[44px] w-full ${BAR} rounded-md bg-border`} />
        </div>
      </div>
    </div>
  );
}
