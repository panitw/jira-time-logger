/**
 * The popup's cold-open loading body (Story 7.9, AC1). A FIXED skeleton
 * shape (design source `imports/jira-time-logger-round2.dc.html:569-587`) —
 * never derived from `resume.status`, the entries count, or anything else
 * that itself has to resolve first (NFR1: a skeleton that waits on data to
 * decide its shape reintroduces the wait the state exists to remove).
 *
 * Occupies the resume card's slot. The `-mt-[10px]` baseline break lives on
 * `<main>` ONLY (Obligation 2 / D-7.3-3 — never duplicated onto an individual
 * card), exactly like `ResumeCard.tsx`'s own pre-existing loading branch
 * (which also carries no self `-mt-[10px]`) — `breaksHeaderBaseline` already
 * covers `'loading'` (`App.tsx`'s Finding 5), so the `'loading'` → real body
 * transition never double-shifts the layout.
 *
 * `animate-skeleton` only — no `animate-spin`, no `LoaderCircle` anywhere in
 * this file (AC1: "no spinner is rendered anywhere"). Colours reuse the
 * EXISTING `bg-border`/`bg-primary-soft` tokens (the same ones
 * `ResumeCard.tsx`'s own pre-existing skeleton branch already uses) rather
 * than inlining the mockup's several near-white greys that have no token —
 * jsdom cannot prove pixel-level shading anyway, and the codebase's own
 * skeleton convention is already token-based, not hex-precise.
 */

const BAR = 'animate-skeleton rounded';

export function PopupSkeletonBody(): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-[10px] rounded-lg border border-border bg-surface p-4 shadow-raised"
    >
      <div className={`h-[12px] w-[78px] ${BAR} bg-primary-soft`} />
      <div className="flex flex-col gap-[3px]">
        <div className={`h-[18px] w-24 ${BAR} bg-border`} />
        <div className={`h-[14px] w-full ${BAR} bg-border`} />
        <div className={`h-[14px] w-[62%] ${BAR} bg-border`} />
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`h-[32px] flex-1 ${BAR} rounded-md bg-border`} />
        <div className={`h-[32px] w-[52px] ${BAR} rounded-md bg-border`} />
        <div className={`h-[32px] w-[52px] ${BAR} rounded-md bg-border`} />
      </div>

      <div className={`h-[36px] w-full ${BAR} rounded-lg bg-border`} />
      <div className={`h-[11px] w-[104px] ${BAR} bg-primary-soft`} />
      <div className="flex flex-col gap-1">
        <div className={`h-[44px] w-full ${BAR} rounded-md bg-border`} />
        <div className={`h-[44px] w-full ${BAR} rounded-md bg-border`} />
      </div>
    </div>
  );
}
