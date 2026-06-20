import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { disconnectAll } from './disconnect';

describe('disconnectAll', () => {
  const localStore = new Map<string, unknown>();
  const sessionStore = new Map<string, unknown>();
  let badgeText: string;
  const tabs: { id: number | undefined }[] = [];
  const sentMessages: { tabId: number | undefined; message: unknown }[] = [];

  beforeEach(() => {
    localStore.clear();
    sessionStore.clear();
    badgeText = '';
    tabs.length = 0;
    sentMessages.length = 0;

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          clear: vi.fn(async () => {
            localStore.clear();
          }),
          get: vi.fn(),
          set: vi.fn(),
        },
        session: {
          remove: vi.fn(async (key: string) => {
            sessionStore.delete(key);
          }),
        },
      },
      tabs: {
        query: vi.fn(
          (
            _queryInfo: chrome.tabs.QueryInfo,
            callback: (tabs: chrome.tabs.Tab[]) => void,
          ) => {
            callback(tabs as chrome.tabs.Tab[]);
          },
        ),
        sendMessage: vi.fn(async (tabId: number | undefined, message: unknown) => {
          sentMessages.push({ tabId, message });
        }),
      },
      action: {
        setBadgeText: vi.fn(async (details: chrome.action.BadgeTextDetails) => {
          badgeText = details.text ?? '';
        }),
      },
      alarms: {
        clear: vi.fn(async (_name: string) => true),
      },
    });

    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns ok on complete success', async () => {
    const result = await disconnectAll();
    expect(result.kind).toBe('ok');
  });

  it('clears chrome.storage.local', async () => {
    localStore.set('some-key', 'value');
    await disconnectAll();
    expect(localStore.size).toBe(0);
    expect(chrome.storage.local.clear).toHaveBeenCalled();
  });

  it('clears chrome.storage.session refresh-in-flight key', async () => {
    sessionStore.set('oauth.refreshInFlight', Date.now());
    await disconnectAll();
    expect(chrome.storage.session.remove).toHaveBeenCalledWith('oauth.refreshInFlight');
  });

  it('clears the toolbar badge', async () => {
    await disconnectAll();
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(badgeText).toBe('');
  });

  it('notifies content-script banners in open Atlassian tabs', async () => {
    tabs.push({ id: 1 }, { id: 2 }, { id: 3 });
    await disconnectAll();
    expect(chrome.tabs.query).toHaveBeenCalled();
    expect(sentMessages.length).toBe(3);
    expect(sentMessages[0]!.message).toEqual({ kind: 'disconnect', payload: {} });
    expect(sentMessages[0]!.tabId).toBe(1);
  });

  it('handles sendMessage rejection gracefully (tab closed / no listener)', async () => {
    tabs.push({ id: 1 });
    vi.mocked(chrome.tabs.sendMessage).mockRejectedValueOnce(
      new Error('Could not establish connection'),
    );
    const result = await disconnectAll();
    expect(result.kind).toBe('ok');
  });

  it('returns storage-clear-failed when chrome.storage.local.clear rejects', async () => {
    vi.mocked(chrome.storage.local.clear).mockRejectedValueOnce(new Error('IO error'));
    const result = await disconnectAll();
    expect(result.kind).toBe('storage-clear-failed');
    expect(result.kind === 'storage-clear-failed' && result.cause).toContain('IO error');
  });

  it('returns badge-clear-failed when setBadgeText rejects', async () => {
    vi.mocked(chrome.action.setBadgeText).mockRejectedValueOnce(new Error('Badge error'));
    const result = await disconnectAll();
    expect(result.kind).toBe('badge-clear-failed');
    expect(result.kind === 'badge-clear-failed' && result.cause).toContain('Badge error');
  });

  it('makes no network calls to Jira APIs', async () => {
    await disconnectAll();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('skips tabs with no id (tab query returns undefined id)', async () => {
    tabs.push({ id: undefined });
    await disconnectAll();
    expect(sentMessages.length).toBe(0);
  });

  it('clears the token-refresh alarm', async () => {
    await disconnectAll();
    expect(chrome.alarms.clear).toHaveBeenCalledWith('token-refresh');
  });

  it('handles alarm clear failure gracefully', async () => {
    vi.mocked(chrome.alarms.clear).mockRejectedValueOnce(new Error('Alarms unavailable'));
    const result = await disconnectAll();
    expect(result.kind).toBe('ok');
  });

  it('sends a Zod-validated payload to tabs', async () => {
    tabs.push({ id: 1 });
    await disconnectAll();
    expect(sentMessages[0]!.message).toEqual({ kind: 'disconnect', payload: {} });
  });
});