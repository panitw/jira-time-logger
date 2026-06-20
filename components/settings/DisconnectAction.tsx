import { useCallback, useState } from 'react';
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

const STRINGS = {
  label: 'Disconnect',
  clearing: 'Clearing…',
  failed: 'Failed. Try again.',
  dialogTitle: 'Disconnect?',
  dialogBody:
    'This will clear your local extension data. Your Jira worklogs and comments remain untouched.',
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
    <>
      <Button
        variant="secondary"
        onClick={() => setStatus({ kind: 'confirming' })}
        disabled={status.kind === 'clearing'}
      >
        {status.kind === 'clearing'
          ? STRINGS.clearing
          : status.kind === 'error'
            ? status.message
            : STRINGS.label}
      </Button>

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
    </>
  );
}