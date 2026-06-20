/**
 * Settings persistence via WXT storage helpers.
 *
 * Per architecture.md > Data Boundaries: settings live in chrome.storage.local.
 * Each setting is an independent defineItem for atomic read/write.
 */
import { storage } from 'wxt/utils/storage';

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