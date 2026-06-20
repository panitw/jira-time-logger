import { describe, it, expect, vi, beforeEach } from 'vitest';

const localStore = new Map<string, unknown>();

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async () => {
        const result: Record<string, unknown> = {};
        localStore.forEach((v, k) => { result[k] = v; });
        return result;
      }),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.entries(obj).forEach(([k, v]) => localStore.set(k, v));
      }),
      remove: vi.fn(async (_keys: string | string[]) => {}),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: { id: 'test-extension-id' },
});

const { setManagerNames, getManagerNames, catchAllProjectKeyItem, ptoSubtaskKeyItem, ptoSubtaskSummaryItem } = await import('./settings');

describe('settings', () => {
  beforeEach(() => {
    localStore.clear();
  });

  it('returns null fallbacks when no names stored', async () => {
    const result = await getManagerNames();
    expect(result).toEqual({ managerDisplayName: null, skipLevelDisplayName: null });
  });

  it('stores and retrieves manager names', async () => {
    await setManagerNames({
      managerDisplayName: 'Marco Rivera',
      skipLevelDisplayName: 'Anika Patel',
    });
    const result = await getManagerNames();
    expect(result).toEqual({
      managerDisplayName: 'Marco Rivera',
      skipLevelDisplayName: 'Anika Patel',
    });
  });

  it('stores partial names (manager only)', async () => {
    await setManagerNames({
      managerDisplayName: 'Marco Rivera',
      skipLevelDisplayName: null,
    });
    const result = await getManagerNames();
    expect(result).toEqual({
      managerDisplayName: 'Marco Rivera',
skipLevelDisplayName: null,
    });
  });

describe('catchAllProjectKey', () => {
  it('defaults to KNP when nothing stored', async () => {
    const key = await catchAllProjectKeyItem.getValue();
    expect(key).toBe('KNP');
  });

  it('stores and retrieves custom project key', async () => {
    await catchAllProjectKeyItem.setValue('TST');
    const key = await catchAllProjectKeyItem.getValue();
    expect(key).toBe('TST');
  });
});

describe('ptoSubtaskKey', () => {
  it('defaults to null', async () => {
    const key = await ptoSubtaskKeyItem.getValue();
    expect(key).toBeNull();
  });

  it('stores and retrieves subtask key and summary', async () => {
    await ptoSubtaskKeyItem.setValue('KNP-99');
    await ptoSubtaskSummaryItem.setValue('PTO');
    expect(await ptoSubtaskKeyItem.getValue()).toBe('KNP-99');
    expect(await ptoSubtaskSummaryItem.getValue()).toBe('PTO');
  });
});
});