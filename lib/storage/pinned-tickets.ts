import { storage } from 'wxt/utils/storage';

export type PinnedTicket = {
  key: string;
  summary: string;
  pinnedAt: string;
};

const MAX_PINNED = 10;

export const pinnedTicketsItem = storage.defineItem<PinnedTicket[]>(
  'local:pinnedTickets',
  { fallback: [] },
);

export async function getPinnedTickets(): Promise<PinnedTicket[]> {
  return pinnedTicketsItem.getValue();
}

export async function addPinnedTicket(
  key: string,
  summary: string,
): Promise<void> {
  const current = await pinnedTicketsItem.getValue();
  const filtered = current.filter((t) => t.key !== key);
  const updated: PinnedTicket[] = [
    { key, summary, pinnedAt: new Date().toISOString() },
    ...filtered,
  ].slice(0, MAX_PINNED);
  await pinnedTicketsItem.setValue(updated);
}

export async function removePinnedTicket(key: string): Promise<void> {
  const current = await pinnedTicketsItem.getValue();
  const updated = current.filter((t) => t.key !== key);
  await pinnedTicketsItem.setValue(updated);
}
