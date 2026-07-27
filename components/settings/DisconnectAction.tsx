import { useCallback, useState } from 'react';
import { SectionRule } from '@/components/settings/SettingsPrimitives';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { disconnectAll } from '@/lib/disconnect';
import { log } from '@/lib/log';

/**
 * Disconnect (Story 7.10, AC5, Block 5 of 5 — separated). `round2:344-355`.
 *
 * D-7.10-47: this red is legitimate — a destructive-action confirm, not a
 * time-state colour (D-7.6-37 governs the latter, not this). Under a GREY
 * rule (`round2:347`), not purple — `SectionRule tone="muted"`.
 *
 * E-4 / D-7.10-45: `disconnectAll()` calls `chrome.storage.local.clear()`
 * (`lib/disconnect.ts:37`), which wipes every SETTING too (catch-all
 * project, time-off subtask, work-day target, daily reminder, approval
 * cycle) — not just credentials and cached worklogs. The body copy below
 * states all three; `lib/settings-disconnect-copy.grep.test.ts` pins the
 * copy against `disconnectAll()`'s actual behaviour so they cannot drift.
 */

const STRINGS = {
  heading: 'Disconnect',
  title: 'Disconnect this browser from Jira',
  body: 'Clears your credentials, every cached worklog, and every setting configured here. Hours already written to Jira are untouched.',
  label: 'Disconnect…',
  clearing: 'Clearing…',
  failed: 'Failed. Try again.',
  dialogTitle: 'Disconnect?',
  dialogBody:
    'This clears your credentials, every cached worklog, and every setting configured here — catch-all project, time-off ticket, work-day target, daily reminder, and approval cycle. Hours already written to Jira are untouched.',
  cancel: 'Cancel',
  confirm: 'Disconnect',
};

type Status =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'clearing' }
  | { kind: 'error'; message: string };

type Props = {
  onDisconnected: () => void;
};

export function DisconnectAction({ onDisconnected }: Props): React.ReactElement {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const handleConfirm = useCallback(async (): Promise<void> => {
    setStatus({ kind: 'clearing' });
    try {
      const result = await disconnectAll();
      if (result.kind !== 'ok') {
        log.error('disconnect.failed', { error: result });
        setStatus({ kind: 'error', message: STRINGS.failed });
        return;
      }
      try {
        onDisconnected();
      } catch (e) {
        log.error('disconnect.on-disconnected-callback.error', { cause: String(e) });
        setStatus({ kind: 'error', message: STRINGS.failed });
      }
    } catch (e) {
      log.error('disconnect.panic', { cause: String(e) });
      setStatus({ kind: 'error', message: STRINGS.failed });
    }
  }, [onDisconnected]);

  return (
    <div className="mt-2 flex flex-col gap-3">
      <SectionRule heading={STRINGS.heading} tone="muted" />
      <div className="flex items-center justify-between gap-5 rounded-lg border border-border bg-surface-sunk p-4">
        <div className="flex flex-col gap-[3px]">
          <span className="text-body text-foreground">{STRINGS.title}</span>
          <span className="text-body-sm leading-[1.5] text-muted">{STRINGS.body}</span>
        </div>
        <button
          type="button"
          onClick={() => setStatus({ kind: 'confirming' })}
          disabled={status.kind === 'clearing'}
          className="shrink-0 rounded-md border border-error-border bg-surface px-3.5 py-2 font-chrome text-[12.5px] font-medium text-error-ink hover:bg-error-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status.kind === 'clearing'
            ? STRINGS.clearing
            : status.kind === 'error'
              ? status.message
              : STRINGS.label}
        </button>
      </div>

      <Dialog
        open={status.kind === 'confirming'}
        onOpenChange={(open) => {
          if (!open) setStatus({ kind: 'idle' });
        }}
      >
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{STRINGS.dialogTitle}</DialogTitle>
            <DialogDescription>{STRINGS.dialogBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setStatus({ kind: 'idle' })}>
              {STRINGS.cancel}
            </Button>
            <Button variant="primary" onClick={() => void handleConfirm()}>
              {STRINGS.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
