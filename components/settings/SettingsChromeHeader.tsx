import { SectionTabs } from '@/components/shared/SectionTabs';
import type { FullPageSection } from '@/lib/open-full-page';

/**
 * The Settings section's chrome header (Story 7.10, AC1/AC4). Follows
 * `WeekChromeHeader.tsx` as the template — same `bg-chrome-gradient`, same
 * ring-motif geometry, same "paint the chrome unconditionally, branch only
 * the data-dependent piece" pattern (D-7.7-22) — so the header still
 * identifies the product while disconnected (`round2:391-396`'s smaller
 * first-run header carries the same eyebrow/title, no status line).
 *
 * Every value is cited to the vendored design source (SD-6), re-read at this
 * story's baseline: `imports/jira-time-logger-round2.dc.html:206-223`.
 *
 * No headline figure, no progress bar (D-7.6-40 / AC4) — Settings has
 * nothing to total. The eyebrow deliberately omits the user's display name
 * (`round2:211`'s "Time Logger · Priya Raman") to match the established
 * `WeekChromeHeader`/`MatrixChromeHeader` convention of NOT plumbing a
 * display name into the chrome eyebrow (`MatrixChromeHeader.tsx`'s Finding
 * 13 — widening a shared hook's return shape for one header's personalization
 * is exactly the seam churn this epic keeps getting burned by).
 */

const STRINGS = {
  product: 'Time Logger',
  title: 'Settings',
  connectedPrefix: 'Connected · ',
  lastSyncedPrefix: 'Last synced ',
};

export type SettingsChromeHeaderProps = {
  /** Story 7.10, D-7.10-30: the shared Week/Manager/Settings tab row. */
  section: FullPageSection;
  onSectionChange: (section: FullPageSection) => void;
  showManagerTab: boolean;
  /** Data-dependent pieces — absent while disconnected (AC8: the connect
   * card is the only actionable element; the header stays honest and says
   * nothing about a connection that doesn't exist). */
  connected: boolean;
  email?: string | undefined;
  /** Already formatted ("4 minutes ago" / "never") — SettingsView owns the
   * `date-fns` call, same division of labour as `DiagnosticsBlock`. */
  lastSyncedLabel?: string | undefined;
};

export function SettingsChromeHeader({
  section,
  onSectionChange,
  showManagerTab,
  connected,
  email,
  lastSyncedLabel,
}: SettingsChromeHeaderProps): React.ReactElement {
  return (
    <header className="bg-chrome-gradient relative overflow-hidden rounded-t-[10px] pb-[20px] pt-[18px] px-[26px]">
      {/* Concentric ring motif — chrome-only decoration, never under data.
       * Byte-identical geometry to WeekChromeHeader.tsx (SD-6: `round2:207-
       * 208` matches `imports/jira-time-logger.dc.html`'s ring exactly). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-[70px] -top-[96px] h-[250px] w-[250px] rounded-full border-[1.5px] border-white/[.14]" />
        <div className="absolute right-[10px] -top-[40px] h-[140px] w-[140px] rounded-full border-[1.5px] border-white/[.12]" />
      </div>

      <div className="relative flex items-end justify-between gap-6">
        <div className="flex flex-col gap-[5px]">
          {/* Hand-computed contrast (D-7.10-41): the design's literal
           * rgba(255,255,255,.72) measures ≈4.04:1 at this gradient's
           * lightest stop (#615B99) — below AA. Raised to /85 (≈4.91:1),
           * the same fix already documented at WeekChromeHeader.tsx:88-96 /
           * MatrixChromeHeader.tsx:111-116 for this identical gradient. */}
          <span className="font-chrome text-eyebrow uppercase text-white/85">
            {STRINGS.product}
          </span>
          <span className="font-chrome text-display text-white">{STRINGS.title}</span>
        </div>

        {connected && (
          <div className="flex flex-col items-end gap-1.5">
            <span className="flex items-center gap-[7px] font-chrome text-[12.5px] text-white/88">
              {/* D-7.6-40 corrected: --color-status-clean-on-chrome's real
               * consumer is THIS dot. Decorative — the adjacent text is
               * fully redundant with it, so WCAG 1.4.11 non-text contrast
               * does not bind (AC4). */}
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-status-clean-on-chrome" />
              {STRINGS.connectedPrefix}
              {email}
            </span>
            {lastSyncedLabel && (
              <span className="font-chrome text-caption tabular text-white/85">
                {STRINGS.lastSyncedPrefix}
                {lastSyncedLabel}
              </span>
            )}
          </div>
        )}
      </div>

      <SectionTabs active={section} onSelect={onSectionChange} showManager={showManagerTab} />
    </header>
  );
}
