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

export interface ManagerNames {
  managerDisplayName: string | null;
  skipLevelDisplayName: string | null;
}

export async function setManagerNames(names: ManagerNames): Promise<void> {
  await managerDisplayNameItem.setValue(names.managerDisplayName);
  await skipLevelDisplayNameItem.setValue(names.skipLevelDisplayName);
}

export async function getManagerNames(): Promise<ManagerNames> {
  const [managerDisplayName, skipLevelDisplayName] = await Promise.all([
    managerDisplayNameItem.getValue(),
    skipLevelDisplayNameItem.getValue(),
  ]);
  return { managerDisplayName, skipLevelDisplayName };
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