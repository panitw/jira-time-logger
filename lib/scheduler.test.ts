import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenBucketScheduler } from './scheduler';

describe('TokenBucketScheduler', () => {
  let scheduler: TokenBucketScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new TokenBucketScheduler(2, 1000);
  });

  it('returns the result of the wrapped function', async () => {
    const result = await scheduler.acquire(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('allows two concurrent calls with default tokens', async () => {
    const p1 = scheduler.acquire(() => Promise.resolve(1));
    const p2 = scheduler.acquire(() => Promise.resolve(2));
    const results = await Promise.all([p1, p2]);
    expect(results).toEqual([1, 2]);
  });

  it('queues third call when tokens are exhausted', async () => {
    let started = false;
    const p1 = scheduler.acquire(async () => {
      await new Promise((r) => setTimeout(r, 200));
      started = true;
      return 1;
    });
    const p2 = scheduler.acquire(() => Promise.resolve(2));
    const p3 = scheduler.acquire(() => Promise.resolve(3));

    await vi.advanceTimersByTimeAsync(100);
    const resolved: number[] = [];
    p2.then((v) => resolved.push(v));
    p3.then((v) => resolved.push(v));

    await vi.advanceTimersByTimeAsync(100);
    expect(started).toBe(true);
    expect(resolved).toContain(2);

    await vi.advanceTimersByTimeAsync(3000);
    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual([1, 2, 3]);
  });

  it('refills tokens after interval', async () => {
    scheduler = new TokenBucketScheduler(1, 100);
    const p1 = scheduler.acquire(() => Promise.resolve(1));
    await p1;
    const p2 = scheduler.acquire(async () => {
      await new Promise((r) => setTimeout(r, 200));
      return 2;
    });

    await vi.advanceTimersByTimeAsync(100);
    const p3 = scheduler.acquire(() => Promise.resolve(3));
    await vi.advanceTimersByTimeAsync(100);

    const results = await Promise.all([p2, p3]);
    expect(results).toEqual([2, 3]);
  });

  it('releases tokens when fn throws', async () => {
    const p1 = scheduler.acquire(() => Promise.resolve(1));
    const p2 = scheduler.acquire(() => Promise.reject(new Error('boom')));
    const p3 = scheduler.acquire(() => Promise.resolve(3));

    await expect(p2).rejects.toThrow('boom');
    const results = await Promise.all([p1, p3]);
    expect(results).toEqual([1, 3]);
  });

  it('never exceeds max tokens after repeated refills', () => {
    scheduler = new TokenBucketScheduler(1, 10);
    vi.advanceTimersByTime(1000);
    scheduler['refill']();
    scheduler['refill']();
    scheduler['refill']();
    expect(scheduler['tokens']).toBeLessThanOrEqual(1);
  });
});