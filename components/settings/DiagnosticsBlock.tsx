import { format } from 'date-fns';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FactRow, FactTable, SectionRule } from '@/components/settings/SettingsPrimitives';
import { Button } from '@/components/ui/button';
import { log } from '@/lib/log';
import { getStorageUsedBytes, clearCache } from '@/lib/storage/quota';
import { lastSyncTimestampItem } from '@/lib/storage/settings';

/**
 * Diagnostics (Story 7.10, AC3, Block 4 of 5) — facts + the one action the
 * design puts inside a facts block. `round2:324-341`.
 *
 * The old monospace utility is retired here in favour of `tabular`
 * (D-7.7-21f, this story's owned allowlist entry): both values here are
 * numerics (a datetime, a storage figure) — `round2:332,337` render them
 * Kanit + `tabular-nums`.
 */

const STRINGS = {
  heading: 'Diagnostics',
  lastSyncLabel: 'Last sync',
  lastSyncNever: 'never',
  localCacheLabel: 'Local cache',
  clearCache: 'Clear cache',
  cleared: 'Cleared',
};

export function DiagnosticsBlock(): React.ReactElement {
  const [syncTs, setSyncTs] = useState<number | null>(null);
  const [storageBytes, setStorageBytes] = useState<number>(0);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const ts = await lastSyncTimestampItem.getValue();
      if (ac.signal.aborted) return;
      setSyncTs(ts);
      const bytes = await getStorageUsedBytes();
      if (!ac.signal.aborted) setStorageBytes(bytes);
    })();
    return () => ac.abort();
  }, []);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleClearCache = useCallback(async (): Promise<void> => {
    try {
      await clearCache();
      setCleared(true);
      log.info('diagnostics.cache-cleared', {});
      const bytes = await getStorageUsedBytes();
      setStorageBytes(bytes);
      timeoutRef.current = setTimeout(() => setCleared(false), 3000);
    } catch (e) {
      log.error('diagnostics.clear-cache-failed', { cause: String(e) });
      setCleared(false);
    }
  }, []);

  const lastSyncLabel = syncTs ? format(new Date(syncTs), 'd MMM yyyy, HH:mm') : STRINGS.lastSyncNever;
  const storageMb = (storageBytes / (1024 * 1024)).toFixed(1);

  return (
    <div className="flex flex-col gap-3">
      <SectionRule heading={STRINGS.heading} />
      <FactTable>
        <FactRow label={STRINGS.lastSyncLabel} tabularValue>
          {lastSyncLabel}
        </FactRow>
        <FactRow label={STRINGS.localCacheLabel}>
          <div className="flex items-center justify-between gap-3">
            <span className="tabular">{storageMb} MB</span>
            <Button variant="secondary" size="sm" onClick={() => void handleClearCache()}>
              {cleared ? STRINGS.cleared : STRINGS.clearCache}
            </Button>
          </div>
        </FactRow>
      </FactTable>
    </div>
  );
}
