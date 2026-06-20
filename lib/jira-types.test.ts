import { describe, it, expect } from 'vitest';
import { JiraMyselfSchema, JiraUserSchema } from './jira-types';

describe('JiraMyselfSchema', () => {
  it('parses a valid myself response', () => {
    const result = JiraMyselfSchema.safeParse({
      accountId: 'abc123',
      displayName: 'Priya Sharma',
      emailAddress: 'priya@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('tolerates missing optional emailAddress', () => {
    const result = JiraMyselfSchema.safeParse({
      accountId: 'abc123',
      displayName: 'Priya Sharma',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required accountId', () => {
    const result = JiraMyselfSchema.safeParse({
      displayName: 'Priya Sharma',
    });
    expect(result.success).toBe(false);
  });

  it('tolerates extra unknown fields', () => {
    const result = JiraMyselfSchema.safeParse({
      accountId: 'abc123',
      displayName: 'Priya Sharma',
      avatarUrl: 'https://example.com/avatar.png',
      timeZone: 'Asia/Kolkata',
    });
    expect(result.success).toBe(true);
  });
});

describe('JiraUserSchema', () => {
  it('parses a valid user response', () => {
    const result = JiraUserSchema.safeParse({
      accountId: 'manager-1',
      displayName: 'Marco Rivera',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing accountId', () => {
    const result = JiraUserSchema.safeParse({
      displayName: 'Marco Rivera',
    });
    expect(result.success).toBe(false);
  });

  it('tolerates extra unknown fields', () => {
    const result = JiraUserSchema.safeParse({
      accountId: 'manager-1',
      displayName: 'Marco Rivera',
      emailAddress: 'marco@example.com',
      active: true,
    });
    expect(result.success).toBe(true);
  });
});