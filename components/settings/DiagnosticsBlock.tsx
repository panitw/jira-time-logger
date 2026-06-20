import { formatDistanceToNow } from 'date-fns';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { log } from '@/lib/log';
import { getStorageUsedBytes, clearCache } from '@/lib/storage/quota';
import { lastSyncTimestampItem } from '@/lib/storage/settings';

const STRINGS = {
  heading: 'Diagnostics',
  lastSync: 'Last sync:',
  lastSyncNever: 'never',
  storageUsed: 'Local storage used:',
  storageLabel: 'MB / 10 MB',
  clearCache: 'Clear local cache',
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
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
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

  const lastSyncLabel = syncTs
    ? formatDistanceToNow(syncTs, { addSuffix: true })
    : STRINGS.lastSyncNever;

  const storageMb = (storageBytes / (1024 * 1024)).toFixed(1);

  return (
    <section className="mt-8">
      <h3 className="text-base font-semibold text-neutral-900">{STRINGS.heading}</h3>
      <hr className="my-3 border-neutral-200" />
      <div className="space-y-2 text-sm text-neutral-700">
        <p>
          {STRINGS.lastSync}{' '}
          <span className="font-mono">{lastSyncLabel}</span>
        </p>
        <p className="flex items-center gap-2">
          <span>
            {STRINGS.storageUsed}{' '}
            <span className="font-mono">
              {storageMb} {STRINGS.storageLabel}
            </span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleClearCache()}
          >
            {cleared ? STRINGS.cleared : STRINGS.clearCache}
          </Button>
        </p>
      </div>
    </section>
  );
}