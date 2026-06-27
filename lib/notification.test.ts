import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { JiraWorklog } from '@/lib/jira-types';

// ---- In-memory wxt storage (targetHours / reminderTime / weekMarkedDone) ----
const store = new Map<string, unknown>();

vi.mock('wxt/utils/storage', () => ({
  storage: {
    defineItem: <T,>(key: string, opts: { fallback: T }) => ({
      getValue: vi.fn(async () =>
        store.has(key) ? (store.get(key) as T) : opts.fallback,
      ),
      setValue: vi.fn(async (value: T) => {
        store.set(key, value);
      }),
      watch: vi.fn(() => () => {}),
    }),
  },
}));

// ---- Mocked auth ----
const getAuthMock = vi.fn();
const hasValidAuthMock = vi.fn();
vi.mock('@/lib/storage/tokens', () => ({
  getAuth: (...args: unknown[]) => getAuthMock(...args),
  hasValidAuth: (...args: unknown[]) => hasValidAuthMock(...args),
}));

// ---- Mocked Jira client ----
const fetchWeekMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  fetchCurrentUserWeekWorklogs: (...args: unknown[]) => fetchWeekMock(...args),
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const {
  composeReminderBody,
  computeLoggedToday,
  nextReminderOccurrence,
  maybeShowDailyReminder,
  handleNotificationClick,
  REMINDER_TITLE,
  REMINDER_NOTIFICATION_ID,
} = await import('./notification');
const { hoursToSeconds } = await import('./hours');

let createdNotifications: { id: string; opts: Record<string, unknown> }[];
let clearedNotifications: string[];
let openPopupCalls: number;

function stubChrome(): void {
  createdNotifications = [];
  clearedNotifications = [];
  openPopupCalls = 0;
  vi.stubGlobal('chrome', {
    notifications: {
      create: vi.fn(async (id: string, opts: Record<string, unknown>) => {
        createdNotifications.push({ id, opts });
      }),
      clear: vi.fn(async (id: string) => {
        clearedNotifications.push(id);
      }),
    },
    action: {
      openPopup: vi.fn(async () => {
        openPopupCalls += 1;
      }),
    },
    runtime: {
      getURL: (p: string) => p,
    },
  });
}

const validBundle = { kind: 'api-token' };

beforeEach(() => {
  store.clear();
  getAuthMock.mockReset();
  hasValidAuthMock.mockReset();
  fetchWeekMock.mockReset();
  stubChrome();
  getAuthMock.mockResolvedValue(validBundle);
  hasValidAuthMock.mockReturnValue(true);
  store.set('local:targetHours', 8);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('composeReminderBody (pure)', () => {
  it('renders exact past-tense "<X>h / <Y>h logged today" string', () => {
    const body = composeReminderBody({
      loggedTodaySeconds: hoursToSeconds(5),
      targetHours: 8,
    });
    expect(body).toBe('5h / 8h logged today');
  });

  it('rounds logged hours to a whole number', () => {
    const body = composeReminderBody({
      loggedTodaySeconds: hoursToSeconds(4.6),
      targetHours: 8,
    });
    expect(body).toBe('5h / 8h logged today');
  });

  it('zero logged renders "0h"', () => {
    const body = composeReminderBody({ loggedTodaySeconds: 0, targetHours: 8 });
    expect(body).toBe('0h / 8h logged today');
  });

  it('copy is strictly past-tense — no "forget" or "should" (UX-DR30)', () => {
    const body = composeReminderBody({
      loggedTodaySeconds: hoursToSeconds(3),
      targetHours: 8,
    });
    const haystack = `${REMINDER_TITLE} ${body}`.toLowerCase();
    expect(haystack).not.toContain('forget');
    expect(haystack).not.toContain('should');
    expect(haystack).not.toContain("don't");
    expect(REMINDER_TITLE).toBe("Log today's time");
  });
});

describe('computeLoggedToday (pure)', () => {
  const ref = new Date(2026, 5, 17, 14, 0, 0); // Wed Jun 17 2026

  let nextId = 0;
  const wl = (seconds: number, started?: string): JiraWorklog => ({
    id: `wl-${(nextId += 1)}`,
    timeSpentSeconds: seconds,
    ...(started ? { started } : {}),
  });

  it('sums only worklogs whose started date is the reference day', () => {
    const result = computeLoggedToday(
      [
        wl(hoursToSeconds(2), '2026-06-17T09:00:00.000+0000'),
        wl(hoursToSeconds(3), '2026-06-17T13:00:00.000+0000'),
        wl(hoursToSeconds(8), '2026-06-16T09:00:00.000+0000'), // yesterday
      ],
      ref,
    );
    expect(result.loggedTodaySeconds).toBe(hoursToSeconds(5));
    expect(result.hasLoggedToday).toBe(true);
  });

  it('hasLoggedToday is false when nothing logged today', () => {
    const result = computeLoggedToday(
      [wl(hoursToSeconds(8), '2026-06-16T09:00:00.000+0000')],
      ref,
    );
    expect(result.loggedTodaySeconds).toBe(0);
    expect(result.hasLoggedToday).toBe(false);
  });

  it('ignores worklogs with absent started (defensive)', () => {
    const result = computeLoggedToday(
      [
        wl(hoursToSeconds(4)), // no started
        wl(hoursToSeconds(1), '2026-06-17T10:00:00.000+0000'),
      ],
      ref,
    );
    expect(result.loggedTodaySeconds).toBe(hoursToSeconds(1));
    expect(result.hasLoggedToday).toBe(true);
  });

  it('detects today across the date boundary (local Y-M-D match)', () => {
    // Reference late on Jun 17; a worklog logged just after local midnight Jun 18
    // must NOT count, and one earlier on Jun 17 must count.
    const lateRef = new Date(2026, 5, 17, 23, 30, 0);
    const result = computeLoggedToday(
      [
        wl(hoursToSeconds(2), '2026-06-17T08:00:00.000'),
        wl(hoursToSeconds(9), '2026-06-18T00:30:00.000'),
      ],
      lateRef,
    );
    expect(result.loggedTodaySeconds).toBe(hoursToSeconds(2));
  });

  it('empty list → zero, not logged', () => {
    const result = computeLoggedToday([], ref);
    expect(result.hasLoggedToday).toBe(false);
    expect(result.loggedTodaySeconds).toBe(0);
  });
});

describe('nextReminderOccurrence (pure)', () => {
  it('returns today-at-time when the time is still in the future', () => {
    const ref = new Date(2026, 5, 17, 10, 0, 0);
    const ms = nextReminderOccurrence('17:00', ref);
    const expected = new Date(2026, 5, 17, 17, 0, 0, 0).getTime();
    expect(ms).toBe(expected);
  });

  it('rolls to tomorrow when the time has already passed', () => {
    const ref = new Date(2026, 5, 17, 18, 0, 0);
    const ms = nextReminderOccurrence('17:00', ref);
    const expected = new Date(2026, 5, 18, 17, 0, 0, 0).getTime();
    expect(ms).toBe(expected);
  });

  it('rolls to tomorrow when exactly equal to now (boundary)', () => {
    const ref = new Date(2026, 5, 17, 17, 0, 0, 0);
    const ms = nextReminderOccurrence('17:00', ref);
    const expected = new Date(2026, 5, 18, 17, 0, 0, 0).getTime();
    expect(ms).toBe(expected);
  });

  it('defaults to 17:00 on a malformed time string', () => {
    const ref = new Date(2026, 5, 17, 10, 0, 0);
    const ms = nextReminderOccurrence('not-a-time', ref);
    const expected = new Date(2026, 5, 17, 17, 0, 0, 0).getTime();
    expect(ms).toBe(expected);
  });

  it('defaults to 17:00 on an empty string (no accidental midnight)', () => {
    const ref = new Date(2026, 5, 17, 10, 0, 0);
    const ms = nextReminderOccurrence('', ref);
    const expected = new Date(2026, 5, 17, 17, 0, 0, 0).getTime();
    expect(ms).toBe(expected);
  });

  it('defaults to 17:00 on out-of-range / negative values (no bogus or past fire)', () => {
    const ref = new Date(2026, 5, 17, 10, 0, 0);
    const expected = new Date(2026, 5, 17, 17, 0, 0, 0).getTime();
    for (const bad of ['24:00', '17:60', '25:99', '-5:30', '17']) {
      expect(nextReminderOccurrence(bad, ref)).toBe(expected);
    }
  });

  it('accepts a single-digit hour ("9:30")', () => {
    const ref = new Date(2026, 5, 17, 8, 0, 0);
    const ms = nextReminderOccurrence('9:30', ref);
    const expected = new Date(2026, 5, 17, 9, 30, 0, 0).getTime();
    expect(ms).toBe(expected);
  });
});

describe('maybeShowDailyReminder orchestration', () => {
  function pinWednesday(): void {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17, 17, 0, 0));
  }

  it('shows a notification with correct title/message/icon when not suppressed', async () => {
    pinWednesday();
    // Nothing logged today (a prior-week-day worklog only) → not suppressed.
    fetchWeekMock.mockResolvedValue({
      kind: 'ok',
      value: [
        { timeSpentSeconds: hoursToSeconds(3), started: '2026-06-16T09:00:00.000' },
      ],
    });
    await maybeShowDailyReminder();
    expect(createdNotifications).toHaveLength(1);
    const { id, opts } = createdNotifications[0]!;
    expect(id).toBe(REMINDER_NOTIFICATION_ID);
    expect(opts.type).toBe('basic');
    expect(opts.title).toBe(REMINDER_TITLE);
    // When shown, nothing is logged today by definition (AC #1 suppresses the
    // already-logged case), so X is always 0.
    expect(opts.message).toBe('0h / 8h logged today');
    expect(opts.iconUrl).toBe('icon/96.png');
  });

  it('suppresses (no fetch) when disconnected (AC #5)', async () => {
    hasValidAuthMock.mockReturnValue(false);
    await maybeShowDailyReminder();
    expect(fetchWeekMock).not.toHaveBeenCalled();
    expect(createdNotifications).toHaveLength(0);
  });

  it('suppresses (no fetch) when null auth', async () => {
    getAuthMock.mockResolvedValue(null);
    hasValidAuthMock.mockReturnValue(false);
    await maybeShowDailyReminder();
    expect(fetchWeekMock).not.toHaveBeenCalled();
    expect(createdNotifications).toHaveLength(0);
  });

  it('suppresses (no fetch) when the CURRENT week is marked done (AC #1)', async () => {
    pinWednesday(); // current week Monday = 2026-06-15
    store.set('local:weekMarkedDone', {
      weekOf: '2026-06-15',
      markedDoneAt: '2026-06-17T17:00:00.000Z',
    });
    await maybeShowDailyReminder();
    expect(fetchWeekMock).not.toHaveBeenCalled();
    expect(createdNotifications).toHaveLength(0);
  });

  it('does NOT suppress when a STALE week is marked done (Story 4.5)', async () => {
    pinWednesday(); // current week Monday = 2026-06-15
    store.set('local:weekMarkedDone', {
      weekOf: '2026-06-08', // last week
      markedDoneAt: '2026-06-12T17:00:00.000Z',
    });
    fetchWeekMock.mockResolvedValue({
      kind: 'ok',
      value: [
        { timeSpentSeconds: hoursToSeconds(3), started: '2026-06-16T09:00:00.000' },
      ],
    });
    await maybeShowDailyReminder();
    expect(fetchWeekMock).toHaveBeenCalled();
    expect(createdNotifications).toHaveLength(1);
  });

  it('suppresses when worker has already logged today (AC #1)', async () => {
    pinWednesday();
    fetchWeekMock.mockResolvedValue({
      kind: 'ok',
      value: [
        { timeSpentSeconds: hoursToSeconds(8), started: '2026-06-17T09:00:00.000' },
      ],
    });
    await maybeShowDailyReminder();
    expect(createdNotifications).toHaveLength(0);
  });

  it('shows when worklogs exist this week but none today', async () => {
    pinWednesday();
    fetchWeekMock.mockResolvedValue({
      kind: 'ok',
      value: [
        { timeSpentSeconds: hoursToSeconds(8), started: '2026-06-16T09:00:00.000' }, // yesterday
      ],
    });
    await maybeShowDailyReminder();
    expect(createdNotifications).toHaveLength(1);
    expect(createdNotifications[0]!.opts.message).toBe('0h / 8h logged today');
  });

  it('does not notify on a transient fetch error', async () => {
    pinWednesday();
    fetchWeekMock.mockResolvedValue({ kind: 'rate-limited', retryAfterMs: 1000 });
    await maybeShowDailyReminder();
    expect(createdNotifications).toHaveLength(0);
  });

  it('never throws even if notifications.create rejects', async () => {
    pinWednesday();
    fetchWeekMock.mockResolvedValue({ kind: 'ok', value: [] });
    (chrome.notifications.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('boom'),
    );
    await expect(maybeShowDailyReminder()).resolves.toBeUndefined();
  });
});

describe('handleNotificationClick', () => {
  it('opens the popup and clears the notification (AC #3)', async () => {
    await handleNotificationClick(REMINDER_NOTIFICATION_ID);
    expect(openPopupCalls).toBe(1);
    expect(clearedNotifications).toEqual([REMINDER_NOTIFICATION_ID]);
  });

  it('ignores clicks on other notification ids', async () => {
    await handleNotificationClick('some-other-id');
    expect(openPopupCalls).toBe(0);
    expect(clearedNotifications).toHaveLength(0);
  });

  it('never throws when openPopup rejects (no focused window)', async () => {
    (chrome.action.openPopup as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('no active window'),
    );
    await expect(
      handleNotificationClick(REMINDER_NOTIFICATION_ID),
    ).resolves.toBeUndefined();
    // Notification is still cleared even if the popup could not open.
    expect(clearedNotifications).toEqual([REMINDER_NOTIFICATION_ID]);
  });
});
