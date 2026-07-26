import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- In-memory wxt storage (targetHours / weekMarkedDone) ----
const store = new Map<string, unknown>();

vi.mock('wxt/utils/storage', () => ({
  storage: {
    defineItem: <T,>(key: string, opts: { fallback: T }) => ({
      getValue: vi.fn(async () => (store.has(key) ? (store.get(key) as T) : opts.fallback)),
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

// workdaysSoFar / currentCycleRange are pure — use the real module so the
// orchestrator math stays anchored to the real Monday boundary, but pin
// "today" via a fake timer where it matters.
const {
  updateBadge,
  computeHoursMissing,
  getWeekHoursMissing,
  getWeekDeficit,
  BADGE_DEFICIT_COLOR,
} = await import('./badge');
const { secondsToHours, hoursToSeconds } = await import('./hours');
const { workdaysSoFar } = await import('./cycle-range');

let badgeText: string;
let badgeColor: string | undefined;

function stubChrome(): void {
  badgeText = 'PREVIOUS';
  badgeColor = undefined;
  vi.stubGlobal('chrome', {
    action: {
      setBadgeText: vi.fn(async (d: { text?: string }) => {
        badgeText = d.text ?? '';
      }),
      setBadgeBackgroundColor: vi.fn(async (d: { color?: string }) => {
        badgeColor = d.color;
      }),
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
  // Default: connected.
  getAuthMock.mockResolvedValue(validBundle);
  hasValidAuthMock.mockReturnValue(true);
  store.set('local:targetHours', 8);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('computeHoursMissing (pure)', () => {
  it('computes deficit = workdays*target − loggedHours', () => {
    // Wed = 3 workdays * 8 = 24 expected; logged 10h → 14 missing.
    const deficit = computeHoursMissing({
      workdaysSoFar: 3,
      targetHours: 8,
      totalLoggedSeconds: hoursToSeconds(10),
    });
    expect(deficit).toBe(14);
  });

  it('Monday morning with zero logged = full single-day deficit (week rollover)', () => {
    const deficit = computeHoursMissing({
      workdaysSoFar: 1,
      targetHours: 8,
      totalLoggedSeconds: 0,
    });
    expect(deficit).toBe(8);
  });

  it('counts PTO/full-day worklogs as logged hours (caught up)', () => {
    // Tue = 2 workdays * 8 = 16; logged 16h (e.g. one full + one PTO day) → 0.
    const deficit = computeHoursMissing({
      workdaysSoFar: 2,
      targetHours: 8,
      totalLoggedSeconds: hoursToSeconds(16),
    });
    expect(deficit).toBe(0);
  });

  it('returns negative when over-logged', () => {
    const deficit = computeHoursMissing({
      workdaysSoFar: 1,
      targetHours: 8,
      totalLoggedSeconds: hoursToSeconds(10),
    });
    expect(deficit).toBe(-2);
  });

  it('deficit math holds across adjacent week boundaries (Sun→Mon)', () => {
    // End of week: Sunday counts a full 5 workdays; logged 32h → 8 missing.
    const sundayDeficit = computeHoursMissing({
      workdaysSoFar: workdaysSoFar(new Date(2026, 5, 21, 18, 0, 0)), // Sun
      targetHours: 8,
      totalLoggedSeconds: hoursToSeconds(32),
    });
    expect(sundayDeficit).toBe(8); // 5*8 - 32
    // New week, Monday morning: resets to a single workday, nothing logged.
    const mondayDeficit = computeHoursMissing({
      workdaysSoFar: workdaysSoFar(new Date(2026, 5, 22, 8, 0, 0)), // next Mon
      targetHours: 8,
      totalLoggedSeconds: 0,
    });
    expect(mondayDeficit).toBe(8); // 1*8 - 0 — full single-day deficit again
  });

  it('uses secondsToHours (no inline / 3600)', () => {
    const seconds = 5400; // 1.5h
    const deficit = computeHoursMissing({
      workdaysSoFar: 1,
      targetHours: 8,
      totalLoggedSeconds: seconds,
    });
    expect(deficit).toBe(8 - secondsToHours(seconds));
  });
});

describe('updateBadge orchestration', () => {
  // Pin "today" to Wed Jun 17 2026 (3 workdays elapsed, target 8 → 24 expected).
  function pinWednesday(): void {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17, 10, 0, 0));
  }

  it('renders an amber <N>h badge when behind (deficit > 0) — D-7.6-36, never red', async () => {
    pinWednesday();
    fetchWeekMock.mockResolvedValue({
      kind: 'ok',
      value: [{ timeSpentSeconds: hoursToSeconds(10) }], // 10h logged
    });
    await updateBadge();
    // 3*8 - 10 = 14
    expect(badgeText).toBe('14h');
    expect(badgeColor).toBe(BADGE_DEFICIT_COLOR);
    expect(BADGE_DEFICIT_COLOR).toBe('#b45309');
  });

  it('clears the badge (no color) when caught up (deficit <= 0)', async () => {
    pinWednesday();
    fetchWeekMock.mockResolvedValue({
      kind: 'ok',
      value: [{ timeSpentSeconds: hoursToSeconds(24) }], // exactly caught up
    });
    await updateBadge();
    expect(badgeText).toBe('');
    expect(badgeColor).toBeUndefined();
  });

  it('clears the badge (no amber "0h") when deficit rounds to 0', async () => {
    pinWednesday();
    // 24 expected - 23.7 logged = 0.3 deficit → rounds to 0 → must clear.
    fetchWeekMock.mockResolvedValue({
      kind: 'ok',
      value: [{ timeSpentSeconds: hoursToSeconds(23.7) }],
    });
    await updateBadge();
    expect(badgeText).toBe('');
    expect(badgeColor).toBeUndefined();
  });

  it('clears the badge when over-logged (deficit < 0)', async () => {
    pinWednesday();
    fetchWeekMock.mockResolvedValue({
      kind: 'ok',
      value: [{ timeSpentSeconds: hoursToSeconds(40) }],
    });
    await updateBadge();
    expect(badgeText).toBe('');
  });

  it('no worklogs → full week-to-date deficit rendered', async () => {
    pinWednesday();
    fetchWeekMock.mockResolvedValue({ kind: 'ok', value: [] });
    await updateBadge();
    expect(badgeText).toBe('24h'); // 3 * 8
    expect(badgeColor).toBe(BADGE_DEFICIT_COLOR);
  });

  it('Monday morning resets to a full single-day deficit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 8, 0, 0)); // Mon
    fetchWeekMock.mockResolvedValue({ kind: 'ok', value: [] });
    await updateBadge();
    expect(badgeText).toBe('8h'); // 1 * 8
  });

  it('counts PTO worklogs toward logged hours (no special handling)', async () => {
    pinWednesday();
    fetchWeekMock.mockResolvedValue({
      kind: 'ok',
      value: [
        { timeSpentSeconds: hoursToSeconds(8) }, // PTO full day
        { timeSpentSeconds: hoursToSeconds(8) }, // normal day
      ],
    });
    await updateBadge();
    // 24 expected - 16 = 8
    expect(badgeText).toBe('8h');
  });

  it('marked-done week (matching weekOf) clears the badge regardless of deficit (AC #3)', async () => {
    pinWednesday(); // week Monday = 2026-06-15
    store.set('local:weekMarkedDone', {
      weekOf: '2026-06-15',
      markedDoneAt: '2026-06-17T10:00:00.000Z',
    });
    fetchWeekMock.mockResolvedValue({
      kind: 'ok',
      value: [], // would otherwise be a 24h deficit
    });
    await updateBadge();
    expect(badgeText).toBe('');
    expect(fetchWeekMock).not.toHaveBeenCalled();
  });

  it('a STALE marked-done (previous weekOf) does NOT suppress this week (Story 4.5)', async () => {
    pinWednesday(); // current week Monday = 2026-06-15
    store.set('local:weekMarkedDone', {
      weekOf: '2026-06-08', // last week
      markedDoneAt: '2026-06-12T10:00:00.000Z',
    });
    fetchWeekMock.mockResolvedValue({ kind: 'ok', value: [] }); // 24h deficit
    await updateBadge();
    expect(badgeText).toBe('24h');
    expect(badgeColor).toBe(BADGE_DEFICIT_COLOR);
  });

  it('null marked-done flag renders the live deficit', async () => {
    pinWednesday();
    store.set('local:weekMarkedDone', null);
    fetchWeekMock.mockResolvedValue({ kind: 'ok', value: [] });
    await updateBadge();
    expect(badgeText).toBe('24h');
  });

  it('disconnected → clears badge and does NOT fetch (AC #6)', async () => {
    hasValidAuthMock.mockReturnValue(false);
    await updateBadge();
    expect(badgeText).toBe('');
    expect(fetchWeekMock).not.toHaveBeenCalled();
  });

  it('null auth → clears badge and does NOT fetch', async () => {
    getAuthMock.mockResolvedValue(null);
    hasValidAuthMock.mockReturnValue(false);
    await updateBadge();
    expect(badgeText).toBe('');
    expect(fetchWeekMock).not.toHaveBeenCalled();
  });

  it('leaves the previous badge untouched on a transient fetch error', async () => {
    pinWednesday();
    fetchWeekMock.mockResolvedValue({ kind: 'rate-limited', retryAfterMs: 1000 });
    await updateBadge();
    expect(badgeText).toBe('PREVIOUS'); // not blanked, not re-rendered
  });

  it('never throws even if a render call rejects', async () => {
    pinWednesday();
    fetchWeekMock.mockResolvedValue({ kind: 'ok', value: [] });
    (chrome.action.setBadgeText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('badge boom'),
    );
    await expect(updateBadge()).resolves.toBeUndefined();
  });
});

describe('getWeekHoursMissing / getWeekDeficit (shared deficit, Story 3.3)', () => {
  function pinWednesday(): void {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17, 10, 0, 0)); // Wed → 3 workdays * 8 = 24
  }

  it('returns the rounded positive deficit when behind', async () => {
    pinWednesday();
    fetchWeekMock.mockResolvedValue({
      kind: 'ok',
      value: [{ timeSpentSeconds: hoursToSeconds(10) }],
    });
    expect(await getWeekHoursMissing()).toBe(14); // 24 - 10
  });

  it('returns 0 when caught up', async () => {
    pinWednesday();
    fetchWeekMock.mockResolvedValue({
      kind: 'ok',
      value: [{ timeSpentSeconds: hoursToSeconds(24) }],
    });
    expect(await getWeekHoursMissing()).toBe(0);
  });

  it('returns 0 when a sub-1h deficit rounds to 0 (never negative, never <1)', async () => {
    pinWednesday();
    fetchWeekMock.mockResolvedValue({
      kind: 'ok',
      value: [{ timeSpentSeconds: hoursToSeconds(23.7) }],
    });
    expect(await getWeekHoursMissing()).toBe(0);
  });

  it('returns null when disconnected (no banner, AC #8) and does NOT fetch', async () => {
    hasValidAuthMock.mockReturnValue(false);
    expect(await getWeekHoursMissing()).toBeNull();
    expect(fetchWeekMock).not.toHaveBeenCalled();
  });

  it('returns null when the current week is marked done', async () => {
    pinWednesday(); // week Monday = 2026-06-15
    store.set('local:weekMarkedDone', {
      weekOf: '2026-06-15',
      markedDoneAt: '2026-06-17T10:00:00.000Z',
    });
    fetchWeekMock.mockResolvedValue({ kind: 'ok', value: [] });
    expect(await getWeekHoursMissing()).toBeNull();
    expect(fetchWeekMock).not.toHaveBeenCalled();
  });

  it('returns the live deficit when a STALE week is marked done', async () => {
    pinWednesday();
    store.set('local:weekMarkedDone', {
      weekOf: '2026-06-08',
      markedDoneAt: '2026-06-12T10:00:00.000Z',
    });
    fetchWeekMock.mockResolvedValue({ kind: 'ok', value: [] });
    expect(await getWeekHoursMissing()).toBe(24);
  });

  it('returns null on a transient fetch error (no stale banner)', async () => {
    pinWednesday();
    fetchWeekMock.mockResolvedValue({ kind: 'rate-limited', retryAfterMs: 1000 });
    expect(await getWeekHoursMissing()).toBeNull();
  });

  it('getWeekDeficit discriminates cleared vs unknown vs deficit', async () => {
    pinWednesday();
    hasValidAuthMock.mockReturnValue(false);
    expect(await getWeekDeficit()).toEqual({ kind: 'cleared', reason: 'disconnected' });

    hasValidAuthMock.mockReturnValue(true);
    fetchWeekMock.mockResolvedValue({ kind: 'network', message: 'x' });
    expect((await getWeekDeficit()).kind).toBe('unknown');

    fetchWeekMock.mockResolvedValue({ kind: 'ok', value: [] });
    expect(await getWeekDeficit()).toEqual({ kind: 'deficit', hours: 24 });
  });
});
