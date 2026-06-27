import { describe, it, expect } from 'vitest';
import {
  JiraCommentListSchema,
  JiraIssueSchema,
  JiraMyselfSchema,
  JiraUserSchema,
  JiraUserSearchResultSchema,
} from './jira-types';

describe('JiraUserSearchResultSchema', () => {
  it('parses an array of directory users with optional manager', () => {
    const result = JiraUserSearchResultSchema.safeParse([
      { accountId: 'r1', displayName: 'Report One', active: true },
      {
        accountId: 'r2',
        displayName: 'Report Two',
        manager: { accountId: 'm1', displayName: 'Manager' },
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('parses an empty directory result', () => {
    expect(JiraUserSearchResultSchema.safeParse([]).success).toBe(true);
  });

  it('rejects a non-array payload', () => {
    expect(JiraUserSearchResultSchema.safeParse({ accountId: 'x' }).success).toBe(false);
  });
});

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

describe('JiraCommentListSchema', () => {
  it('parses a comment list with ADF bodies and extra fields', () => {
    const result = JiraCommentListSchema.safeParse({
      total: 1,
      maxResults: 100,
      comments: [
        {
          id: '10100',
          created: '2026-05-31T09:00:00.000+0000',
          author: { accountId: '557058:mgr' },
          body: { type: 'doc', version: 1, content: [] },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('tolerates a missing optional total', () => {
    const result = JiraCommentListSchema.safeParse({
      comments: [{ id: '1', created: '2026-05-31T09:00:00.000+0000', body: {} }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a comment missing the created timestamp', () => {
    const result = JiraCommentListSchema.safeParse({
      comments: [{ id: '1', body: {} }],
    });
    expect(result.success).toBe(false);
  });
});