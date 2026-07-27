import { formatDistanceToNow } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';
import { ConnectButton } from '@/components/settings/ConnectButton';
import { ConnectionBlock } from '@/components/settings/ConnectionBlock';
import { DiagnosticsBlock } from '@/components/settings/DiagnosticsBlock';
import { DisconnectAction } from '@/components/settings/DisconnectAction';
import { LoggingDefaultsBlock } from '@/components/settings/LoggingDefaultsBlock';
import { LoggingDefaultsSilhouette } from '@/components/settings/LoggingDefaultsSilhouette';
import { ManagerDisplay, type ManagerNames } from '@/components/settings/ManagerDisplay';
import { SettingsChromeHeader } from '@/components/settings/SettingsChromeHeader';
import { resolveConnectedMeta } from '@/lib/connection-meta';
import { log } from '@/lib/log';
import { resolveReportingLine } from '@/lib/manager-resolution';
import type { FullPageSection } from '@/lib/open-full-page';
import { lastSyncTimestampItem } from '@/lib/storage/settings';
import { getAuth, hasValidAuth } from '@/lib/storage/tokens';

/**
 * Settings section (Story 7.10, AC1-AC9): the five-block full-page surface
 * that replaces the old `entrypoints/options/App.tsx` composition root.
 * `resolveConnectedMeta`/manager-resolution/auth-state logic moved here
 * verbatim from that file (D-7.10-39) — it doesn't die, it relocates.
 *
 * Shell: 1180px card (AC2), chrome header, then a `680px` reading column
 * left-aligned inside `26px` padding — the empty right margin is left
 * empty (AC2's own words: "it is what signals a page you read rather than
 * a grid you work").
 */

type ViewState =
  | { kind: 'loading' }
  | { kind: 'first-run' }
  | { kind: 'connected'; email: string; siteDomain: string; authMethod: 'oauth' | 'api-token' };

type ManagerState = {
  resolving: boolean;
  error: boolean;
  names: ManagerNames | null;
};

export type SettingsViewProps = {
  section: FullPageSection;
  onSectionChange: (section: FullPageSection) => void;
  showManagerTab: boolean;
};

export function SettingsView({
  section,
  onSectionChange,
  showManagerTab,
}: SettingsViewProps): React.ReactElement {
  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  // M-6: start `resolving: true`, not `false`. The effect below flips it
  // to `true` too, but only after the first commit — with `false` here,
  // the "connected" view's very first paint briefly rendered "Not set in
  // Jira" (a confident-looking value) for one frame before the skeleton
  // took over, which is exactly the false-confidence AC7 exists to avoid.
  const [managerState, setManagerState] = useState<ManagerState>({
    resolving: true,
    error: false,
    names: null,
  });
  const [managerRetryToken, setManagerRetryToken] = useState(0);
  const [lastSyncTs, setLastSyncTs] = useState<number | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const bundle = await getAuth();
        if (!hasValidAuth(bundle)) {
          if (!ac.signal.aborted) setView({ kind: 'first-run' });
          return;
        }
        const meta = await resolveConnectedMeta(bundle!);
        if (ac.signal.aborted) return;
        setView({
          kind: 'connected',
          email: meta.email,
          siteDomain: meta.siteDomain,
          authMethod: bundle!.kind,
        });
      } catch (e) {
        log.error('settings.init.error', { cause: String(e) });
        if (!ac.signal.aborted) setView({ kind: 'first-run' });
      }
    })();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (view.kind !== 'connected') return;
    const ac = new AbortController();
    setManagerState((s) => ({ ...s, resolving: true, error: false }));
    void (async () => {
      const result = await resolveReportingLine();
      if (ac.signal.aborted) return;
      if (result.kind === 'ok') {
        setManagerState({ resolving: false, error: false, names: result.value });
      } else {
        log.warn('settings.manager-resolution.failed', { kind: result.kind });
        setManagerState({ resolving: false, error: true, names: null });
      }
    })();
    return () => ac.abort();
  }, [view.kind, managerRetryToken]);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const ts = await lastSyncTimestampItem.getValue();
      if (!ac.signal.aborted) setLastSyncTs(ts);
    })();
    return () => ac.abort();
  }, []);

  const handleConnected = useCallback((email: string, siteDomain: string): void => {
    // Read the auth kind from storage so the badge label is accurate.
    void (async () => {
      const bundle = await getAuth();
      setView({
        kind: 'connected',
        email,
        siteDomain,
        authMethod: bundle?.kind ?? 'oauth',
      });
    })();
  }, []);

  const handleManagerRetry = useCallback(() => {
    setManagerRetryToken((t) => t + 1);
  }, []);

  const connected = view.kind === 'connected';
  const lastSyncedLabel = lastSyncTs ? formatDistanceToNow(lastSyncTs, { addSuffix: true }) : undefined;

  return (
    // R-2/f: `shadow-lift`, matching the design source (`round2:205`,
    // `0 18px 40px rgba(74,65,99,.10)`) — `--shadow-lift` is the close
    // match; `shadow-raised` (this file's previous substitute) is 44% less
    // y-offset, 35% less blur and 20% less alpha, a visibly lighter card.
    // The exclusivity guard this collided with (`ResumeCard.test.tsx`) is
    // now narrowed to the popup surface only, per Story 7.3 AC1's actual
    // wording ("the only element IN THE POPUP that carries it") — a
    // full-page Settings card was never in its scope.
    <div className="w-[1180px] max-w-full overflow-hidden rounded-[10px] border border-border bg-background shadow-lift motion-safe:animate-fade-in">
      <SettingsChromeHeader
        section={section}
        onSectionChange={onSectionChange}
        showManagerTab={showManagerTab}
        connected={connected}
        email={connected ? view.email : undefined}
        lastSyncedLabel={connected ? lastSyncedLabel : undefined}
      />

      {view.kind === 'connected' && (
        <div className="flex justify-start p-[26px]">
          <div className="flex w-[680px] max-w-full flex-col gap-[26px]">
            <ConnectionBlock
              email={view.email}
              siteDomain={view.siteDomain}
              authMethod={view.authMethod}
            />
            <ManagerDisplay
              managerDisplayName={managerState.names?.managerDisplayName ?? null}
              skipLevelDisplayName={managerState.names?.skipLevelDisplayName ?? null}
              loading={managerState.resolving}
              error={managerState.error}
              onRetry={handleManagerRetry}
            />
            <LoggingDefaultsBlock />
            <DiagnosticsBlock />
            <DisconnectAction onDisconnected={() => setView({ kind: 'first-run' })} />
          </div>
        </div>
      )}

      {view.kind === 'first-run' && (
        // M-12: left-aligned, matching the connected state's 680px reading
        // column (AC2) rather than centring — a centred first-run state and
        // a left-aligned connected state disagreed on alignment for no
        // design reason (the design source's mini-mockup isn't drawn at
        // this page's true scale).
        <div className="flex flex-col items-start gap-[12px] p-[26px]">
          <ConnectButton onConnected={handleConnected} />
          <LoggingDefaultsSilhouette />
        </div>
      )}

      {/* view.kind === 'loading': chrome header paints unconditionally
       * above (D-7.7-22 pattern) — the body stays empty rather than
       * flashing a connect card that might immediately be replaced by real
       * content, and per epics.md's standing rule, never a spinner. */}
    </div>
  );
}
