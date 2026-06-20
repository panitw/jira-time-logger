/**
 * Token-bucket rate-limit scheduler.
 *
 * Every Jira API call flows through this singleton. Jira Cloud enforces ~2 req/s.
 * This throttles same-instance concurrent requests to prevent 429 storms.
 *
 * Per architecture.md > Rate-Limit Governance: singleton owned by the service worker.
 * The scheduler is a best-effort throttle, not an exact enforcement boundary.
 */

export class TokenBucketScheduler {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number;

  constructor(maxTokens = 2, refillIntervalMs = 1000) {
    this.maxTokens = maxTokens;
    this.refillIntervalMs = refillIntervalMs;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForToken();
    this.tokens -= 1;
    try {
      return await fn();
    } finally {
      this.tokens = Math.min(this.maxTokens, this.tokens + 1);
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed < this.refillIntervalMs) return;
    const newTokens = Math.floor(elapsed / this.refillIntervalMs);
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill += newTokens * this.refillIntervalMs;
  }

  private async waitForToken(): Promise<void> {
    this.refill();
    while (this.tokens <= 0) {
      await new Promise((resolve) => setTimeout(resolve, this.refillIntervalMs));
      this.refill();
    }
  }
}

export const scheduler = new TokenBucketScheduler(2, 1000);