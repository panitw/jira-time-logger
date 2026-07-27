import { FactRow, FactTable, FactTableFooter, SectionRule } from '@/components/settings/SettingsPrimitives';

/**
 * Connection block (Story 7.10, AC3/AC4, Block 1 of 5) — facts, no input
 * affordance. `round2:229-246`.
 */

const STRINGS = {
  heading: 'Connection',
  accountLabel: 'Account',
  siteLabel: 'Jira site',
  signedInLabel: 'Signed in',
  authMethodOAuth: 'via OAuth',
  authMethodApiToken: 'via API token',
  footerNote: 'Credentials are stored in this browser profile only.',
};

export type ConnectionBlockProps = {
  email: string;
  siteDomain: string;
  authMethod: 'oauth' | 'api-token';
};

export function ConnectionBlock({
  email,
  siteDomain,
  authMethod,
}: ConnectionBlockProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <SectionRule heading={STRINGS.heading} />
      <FactTable
        footer={
          <FactTableFooter>
            <span className="text-body-sm text-faint">{STRINGS.footerNote}</span>
            {/*
             * THE SCOPE TRAP (D-7.10-37) — the design source draws a
             * "Re-authenticate" button in this footer row
             * (`imports/jira-time-logger-round2.dc.html:243`). It is NOT
             * built here, and nothing is substituted for it. Three
             * independent sources agree it is out of scope for this story:
             *   - `_bmad-output/planning-artifacts/epics.md:2076` (this
             *     story's own "Out of scope" line)
             *   - `.../EXPERIENCE.md:403-405` Open Item 3a ("new
             *     functionality, not a restyle")
             *   - `epic-7-decision-log.md` SD-1 ("must not silently grow a
             *     new auth flow")
             * The only auth entry points in this codebase are
             * `startOAuthFlow()`, `validateApiToken()` and
             * `disconnectAll()` — there is no re-auth path, and no partial
             * one. A renamed stand-in ("Reconnect", "Sign in again",
             * "Refresh connection") is banned: a Disconnect-then-Connect
             * flow masquerading as "re-auth" would destroy every configured
             * setting (D-7.10-45) behind a button that promises a refresh.
             * `lib/no-reauth.grep.test.ts` RED-proves this absence.
             */}
          </FactTableFooter>
        }
      >
        <FactRow label={STRINGS.accountLabel} tabularValue>
          {email}
        </FactRow>
        <FactRow label={STRINGS.siteLabel} tabularValue>
          {siteDomain}
        </FactRow>
        <FactRow label={STRINGS.signedInLabel}>
          {/* ESCALATION E-3: the design shows "via OAuth · 12 Jun 2026"
           * (`round2:1347`), but no `connectedAt` timestamp is stored
           * anywhere (`lib/storage/tokens.ts`'s `setAuth` records none) —
           * inventing one here would be fabricated data. Render the method
           * only. */}
          {authMethod === 'oauth' ? STRINGS.authMethodOAuth : STRINGS.authMethodApiToken}
        </FactRow>
      </FactTable>
    </div>
  );
}
