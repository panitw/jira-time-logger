/**
 * Settings persistence via WXT storage helpers.
 *
 * Per architecture.md > Data Boundaries: settings live in chrome.storage.local.
 * Each setting is an independent defineItem for atomic read/write.
 */
import { storage } from 'wxt/utils/storage';

// ---- Reporting line ----

export const managerDisplayNameItem = storage.defineItem<string | null>(
  'local:managerDisplayName',
  { fallback: null },
);

export const skipLevelDisplayNameItem = storage.defineItem<string | null>(
  'local:skipLevelDisplayName',
  { fallback: null },
);

export const managerAccountIdItem = storage.defineItem<string | null>(
  'local:managerAccountId',
  { fallback: null },
);

export const skipLevelAccountIdItem = storage.defineItem<string | null>(
  'local:skipLevelAccountId',
  { fallback: null },
);

export interface ManagerNames {
  managerDisplayName: string | null;
  skipLevelDisplayName: string | null;
  managerAccountId: string | null;
  skipLevelAccountId: string | null;
}

export async function setManagerNames(names: ManagerNames): Promise<void> {
  await Promise.all([
    managerDisplayNameItem.setValue(names.managerDisplayName),
    skipLevelDisplayNameItem.setValue(names.skipLevelDisplayName),
    managerAccountIdItem.setValue(names.managerAccountId),
    skipLevelAccountIdItem.setValue(names.skipLevelAccountId),
  ]);
}

export async function getManagerNames(): Promise<ManagerNames> {
  const [
    managerDisplayName,
    skipLevelDisplayName,
    managerAccountId,
    skipLevelAccountId,
  ] = await Promise.all([
    managerDisplayNameItem.getValue(),
    skipLevelDisplayNameItem.getValue(),
    managerAccountIdItem.getValue(),
    skipLevelAccountIdItem.getValue(),
  ]);
  return {
    managerDisplayName,
    skipLevelDisplayName,
    managerAccountId,
    skipLevelAccountId,
  };
}

// ---- Catch-all project (Story 1.5) ----

export const catchAllProjectKeyItem = storage.defineItem<string>(
  'local:catchAllProjectKey',
  { fallback: 'KNP' },
);

export const ptoSubtaskKeyItem = storage.defineItem<string | null>(
  'local:ptoSubtaskKey',
  { fallback: null },
);

export const ptoSubtaskSummaryItem = storage.defineItem<string | null>(
  'local:ptoSubtaskSummary',
  { fallback: null },
);

// ---- Cadence (Story 1.6) ----

export const reminderTimeItem = storage.defineItem<string>(
  'local:reminderTime',
  { fallback: '17:00' },
);

export const targetHoursItem = storage.defineItem<number>(
  'local:targetHours',
  { fallback: 8 },
);

export const approvalCycleItem = storage.defineItem<string>(
  'local:approvalCycle',
  { fallback: 'calendar-month' },
);

// ---- Diagnostics (Story 1.7) ----

export const lastSyncTimestampItem = storage.defineItem<number | null>(
  'local:lastSyncTimestamp',
  { fallback: null },
);