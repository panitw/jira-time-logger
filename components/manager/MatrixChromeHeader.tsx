import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { DayStatusIndicator } from '@/components/shared/DayStatusIndicator';
import { Button } from '@/components/ui/button';

/**
 * The manager matrix's chrome header (Story 7.8, AC1). Follows
 * `WeekChromeHeader.tsx` as the template — same gradient utility, same ring
 * motif, same "paint the chrome unconditionally, branch only the
 * data-dependent piece" pattern, so the header renders identically in the
 * pending/error/no-reports gates as the old plain `Header` did
 * (`ManagerMatrix.tsx`'s former `:264, 283, 309` call sites).
 *
 * Mounted BY `ManagerMatrix` (D-7.7-22's precedent: the chrome lives inside
 * the section component, not the full-page shell) — `entrypoints/fullpage/
 * App.tsx` is untouched by this story.
 *
 * Every value is cited to the vendored design source (SD-6), re-read at this
 * story's baseline: `imports/jira-time-logger.dc.html:476-494`.
 */

const STRINGS = {
  eyebrowWithoutName: (n: number) => `Approvals · ${n} ${n === 1 ? 'report' : 'reports'}`,
  approved: (done: number, total: number) => `${done} of ${total} approved`,
  needAttention: (n: number) => `${n} need attention`,
  approveRemaining: 'Approve remaining',
  changeCycle: 'Change cycle',
  changeCycleAria: 'Change cycle',
  menuLabel: 'Change cycle',
  previousCycle: 'Previous cycle',
  nextCycle: 'Next cycle',
};

type Props = {
  cycleTitle: string;
  /** `undefined` while reports are still resolving — the counts/CTA gate on
   * this the same way the old `Header`'s did (`reportCount !== undefined`). */
  reportCount?: number;
  /** Count of fully-approved rows. */
  doneCount?: number;
  /** Count of rows with at least one dirty (edited-after-approval) cell —
   * D-7.8-30: rendered white/opacity only, never amber, and omitted at zero. */
  needAttentionCount?: number;
  onPrevCycle: () => void;
  onNextCycle: () => void;
  onApproveRemaining: () => void;
  /** A non-empty reason disables "Approve remaining" with a visible/announced
   * explanation (D-7.8-29: never ship an inert button). */
  approveRemainingDisabledReason?: string | undefined;
};

export function MatrixChromeHeader({
  cycleTitle,
  reportCount,
  doneCount,
  needAttentionCount,
  onPrevCycle,
  onNextCycle,
  onApproveRemaining,
  approveRemainingDisabledReason,
}: Props): React.ReactElement {
  const [cycleMenuOpen, setCycleMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeCycleMenu = useCallback((restoreFocus = true) => {
    setCycleMenuOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Esc + click-outside dismissal (same convention as `PtoPopover.tsx`).
  useEffect(() => {
    if (!cycleMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeCycleMenu();
      }
    };
    const isInside = (target: Node | null): boolean =>
      Boolean(
        target &&
          (menuRef.current?.contains(target) || triggerRef.current?.contains(target)),
      );
    const onPointerDown = (e: MouseEvent): void => {
      if (isInside(e.target as Node)) return;
      closeCycleMenu(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [cycleMenuOpen, closeCycleMenu]);

  const hasReports = reportCount !== undefined;
  const showAttention = hasReports && (needAttentionCount ?? 0) > 0;
  const approveRemainingDisabled = approveRemainingDisabledReason !== undefined;
  const approveRemainingReasonId = useId();

  return (
    <header className="bg-chrome-gradient relative overflow-hidden rounded-t-[10px] px-[26px] pb-[20px] pt-[18px]">
      {/* Concentric ring motif — chrome-only decoration, never under data. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-[60px] -top-[100px] h-[250px] w-[250px] rounded-full border-[1.5px] border-white/[.14]" />
      </div>

      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-[5px]">
          {/* Hand-computed contrast (D-7.8-30): the design's literal
           * `rgba(255,255,255,.72)` measures ≈4.04:1 at this gradient's
           * lightest stop (#615B99) — below AA. Raised to /85 (≈4.91:1),
           * the same fix `WeekChromeHeader.tsx` and `ChromeHeader.tsx`
           * already carry for the identical gradient.
           *
           * Finding 13 (Minor): the manager's own display name (AC1's
           * "Approvals · <manager> · N reports") is DELIBERATELY not
           * plumbed here, not because it's unavailable — `JiraMyselfSchema`
           * DOES declare `displayName`, `useCurrentUser`'s queryFn fetches
           * and validates it, then discards it one line before returning
           * (`hooks/useCurrentUser.ts`'s final `return myself.value.accountId`)
           * — but because widening that hook's return shape from `string`
           * to an object ripples into every consumer of the widest shared
           * seam this epic keeps getting burned by
           * (`hooks/useTicketSearch.ts`, `ManagerMatrix.tsx` itself, every
           * `managerAccountId: string` typed call site). A named, tracked
           * AC1 gap — see `deferred-work.md` — beats a speculative seam
           * change at finisher stage. */}
          <span className="font-chrome text-eyebrow uppercase text-white/85">
            {hasReports ? STRINGS.eyebrowWithoutName(reportCount) : 'Approvals'}
          </span>
          <div className="flex items-baseline gap-[14px]">
            <span className="font-chrome text-display text-white">{cycleTitle}</span>
            <span className="relative inline-block">
              <button
                ref={triggerRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={cycleMenuOpen}
                aria-label={STRINGS.changeCycleAria}
                onClick={() => setCycleMenuOpen((prev) => !prev)}
                className="flex items-center gap-1 rounded-md border border-white/[.28] px-[9px] py-1 font-chrome text-[12.5px] text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                {STRINGS.changeCycle}
                <ChevronDown size={12} aria-hidden="true" />
              </button>
              {cycleMenuOpen ? (
                <div
                  ref={menuRef}
                  role="menu"
                  aria-label={STRINGS.menuLabel}
                  className="absolute left-0 top-full z-10 mt-1 w-40 rounded-md border border-neutral-200 bg-white p-1 text-left shadow-md"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeCycleMenu(false);
                      onPrevCycle();
                    }}
                    className="block w-full rounded px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-focus"
                  >
                    {STRINGS.previousCycle}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeCycleMenu(false);
                      onNextCycle();
                    }}
                    className="mt-0.5 block w-full rounded px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-focus"
                  >
                    {STRINGS.nextCycle}
                  </button>
                </div>
              ) : null}
            </span>
          </div>
        </div>

        {hasReports ? (
          <div className="flex flex-wrap items-center gap-[14px]">
            <div className="flex items-center gap-4 font-chrome text-[12.5px] text-white/85">
              <span data-testid="matrix-progress">{STRINGS.approved(doneCount ?? 0, reportCount)}</span>
              {/* D-7.8-30: white/opacity only — the design's per-status amber
               * (`#F5D9AE`, dc.html:490) measures 4.45:1 on this gradient's
               * lightest stop, below AA, and D-7.6-40 independently forbids
               * per-status colour on chrome regardless. */}
              {showAttention ? (
                <DayStatusIndicator
                  variant="inline"
                  status="attention"
                  tone="chrome"
                  label={STRINGS.needAttention(needAttentionCount ?? 0)}
                />
              ) : null}
            </div>
            <Button
              variant="chrome"
              onClick={() => {
                // Fail-closed, same discipline as ApproveButton: never fire
                // while disabled, regardless of the aria-disabled affordance.
                if (approveRemainingDisabled) return;
                onApproveRemaining();
              }}
              aria-disabled={approveRemainingDisabled || undefined}
              aria-describedby={approveRemainingDisabled ? approveRemainingReasonId : undefined}
              title={approveRemainingDisabledReason}
              className={approveRemainingDisabled ? 'cursor-not-allowed opacity-60' : undefined}
            >
              {STRINGS.approveRemaining}
            </Button>
            {approveRemainingDisabled ? (
              <span id={approveRemainingReasonId} className="sr-only">
                {approveRemainingDisabledReason}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
