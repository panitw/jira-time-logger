import { describe, it, expect } from 'vitest';
import { JiraIssueSchema, JiraMyselfSchema, JiraUserSchema } from './jira-types';

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

  it('parses user response with manager field', () => {
    const result = JiraUserSchema.safeParse({
      accountId: 'manager-1',
      displayName: 'Marco Rivera',
      manager: {
        accountId: 'skip-1',
        displayName: 'Anika Patel',
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.manager?.displayName).toBe('Anika Patel');
    }
  });

  it('rejects missing accountId', () => {
    const result = JiraUserSchema.safeParse({
      displayName: 'Marco Rivera',
    });
    expect(result.success).toBe(false);
  });
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

describe('JiraIssueSchema', () => {
  it('parses a valid issue response', () => {
    const result = JiraIssueSchema.safeParse({
      id: '10001',
      key: 'KNP-1',
      fields: { summary: 'My task' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing key', () => {
    const result = JiraIssueSchema.safeParse({
      id: '10001',
      fields: { summary: 'My task' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing fields.summary', () => {
    const result = JiraIssueSchema.safeParse({
      id: '10001',
      key: 'KNP-1',
      fields: {},
    });
    expect(result.success).toBe(false);
  });

  it('tolerates extra fields on issue', () => {
    const result = JiraIssueSchema.safeParse({
      id: '10001',
      key: 'KNP-1',
      fields: { summary: 'My task', priority: 'High' },
      self: 'https://example.com/rest/api/3/issue/10001',
    });
    expect(result.success).toBe(true);
  });
});