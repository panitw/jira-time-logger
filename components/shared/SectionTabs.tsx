import type { FullPageSection } from '@/lib/open-full-page';

/**
 * The ONE Week / Manager / Settings tab row, shared by all three full-page
 * chrome headers (Story 7.10, D-7.10-30 — an owner ruling superseding E-1).
 *
 * The vendored design source (SD-6) draws this row on Surface 5 (Settings)
 * only (`imports/jira-time-logger-round2.dc.html:219-223`); Surfaces 2/3
 * (Week/Manager) have no tab row drawn. D-7.10-30 rules that this is an
 * ILLUSTRATIVE omission, not an instruction to build the row once — the
 * story's own AC1 states the intent ("the chrome header carries a Week /
 * Manager / Settings tab row, which is the mechanism that folds two pages
 * into one") without scoping it to one surface, and spines win on intent.
 *
 * This component REPLACES Story 7.2's interim plain `<nav>` in
 * `entrypoints/fullpage/App.tsx` (removed, not left alongside) — each of
 * `WeekChromeHeader`, `MatrixChromeHeader` and `SettingsChromeHeader` mounts
 * this instead, following the established D-7.7-22 pattern that chrome lives
 * INSIDE the section component, not the full-page shell.
 *
 * Colour values are the SAME hand-computed `/85` fix already documented at
 * `WeekChromeHeader.tsx:88-96` / `MatrixChromeHeader.tsx:111-116` for this
 * exact gradient (`rgba(255,255,255,.72)` measures ≈4.04:1 at the gradient's
 * lightest stop, below AA's 4.5:1) — reused here, not re-derived.
 *
 * Focus: the tab buttons pair `focus-visible:ring-2 focus-visible:ring-white/60`
 * with no extra border. EXPERIENCE.md:257-258 documents no exception for this
 * — this is PRECEDENT, not a documented exception: `WeekChromeHeader.tsx:112`'s
 * existing prev/next nav buttons already use the identical ring-only pairing
 * on this same purple chrome surface, and the outcome is compliant on merit
 * (`ring-white/60` measures 3.32:1+ against the gradient, clearing WCAG
 * 1.4.11 — hand-computed, see the story's Completion Notes) (N-1).
 */

const LABEL: Record<FullPageSection, string> = {
  week: 'Week',
  manager: 'Manager',
  settings: 'Settings',
};

const ORDER: FullPageSection[] = ['week', 'manager', 'settings'];

export type SectionTabsProps = {
  /** The section this host surface currently renders. */
  active: FullPageSection;
  onSelect: (section: FullPageSection) => void;
  /** Manager tab hidden entirely while the current user has no direct
   * reports — mirrors the removed shell nav's exact semantics (never
   * rendered disabled, UX-DR18). */
  showManager: boolean;
};

export function SectionTabs({ active, onSelect, showManager }: SectionTabsProps): React.ReactElement {
  const sections = ORDER.filter((s) => s !== 'manager' || showManager);

  return (
    <nav aria-label="Sections" className="relative mt-4 flex gap-1">
      {sections.map((section) => {
        const isActive = section === active;
        return (
          <button
            key={section}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(section)}
            className={
              isActive
                ? 'rounded-md bg-surface px-3 py-1.5 font-chrome text-[12.5px] font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60'
                // N-5: the removed shell `<nav>` had `hover:bg-neutral-100`;
                // the inactive tab restores an equivalent hover affordance
                // (a subtle white wash, appropriate on the purple chrome).
                : 'rounded-md px-3 py-1.5 font-chrome text-[12.5px] font-medium text-white/85 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60'
            }
          >
            {LABEL[section]}
          </button>
        );
      })}
    </nav>
  );
}
