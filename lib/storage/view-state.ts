import { storage } from 'wxt/utils/storage';

export type ISODate = string;

export type PopupView =
  | { kind: 'today' }
  | { kind: 'week'; weekOf: ISODate };

const popupViewItem = storage.defineItem<PopupView>('local:popupView', {
  fallback: { kind: 'today' },
});

export async function getPopupView(): Promise<PopupView> {
  return popupViewItem.getValue();
}

export async function setPopupView(view: PopupView): Promise<void> {
  await popupViewItem.setValue(view);
}

/**
 * Mark-week-as-done flag (Story 4.5, FR24/FR26). Local-only — never posted to
 * Jira and never visible to a manager. `weekOf` is the local-midnight Monday
 * (`YYYY-MM-DD`) of the week that was marked done; `markedDoneAt` is the ISO
 * timestamp of the act. Authoritative home of the `local:weekMarkedDone` key;
 * `lib/badge.ts` reads it (week-aware) to suppress the toolbar badge.
 */
export type MarkDoneState = { weekOf: ISODate; markedDoneAt: string };

const weekMarkedDoneItem = storage.defineItem<MarkDoneState | null>(
  'local:weekMarkedDone',
  { fallback: null },
);

export async function getMarkDoneState(): Promise<MarkDoneState | null> {
  const value = await weekMarkedDoneItem.getValue();
  // Defensive: this key previously held a bare `boolean` (the Story 3.1 badge
  // stub). The WXT `null` fallback only applies to an absent key, so a stale
  // boolean would survive the reshape. Coerce any non-conforming value to
  // `null` so callers only ever see a `MarkDoneState | null`.
  if (value == null || typeof value !== 'object' || typeof value.weekOf !== 'string') {
    return null;
  }
  return value;
}

export async function setWeekMarkedDone(weekOf: ISODate): Promise<void> {
  await weekMarkedDoneItem.setValue({
    weekOf,
    markedDoneAt: new Date().toISOString(),
  });
}

export async function clearWeekMarkedDone(): Promise<void> {
  await weekMarkedDoneItem.setValue(null);
}