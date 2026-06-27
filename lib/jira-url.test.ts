import { describe, it, expect } from 'vitest';
import { currentTicketFromUrl } from './jira-url';

describe('currentTicketFromUrl', () => {
  it('extracts the key from a /browse/<KEY> URL', () => {
    expect(currentTicketFromUrl('https://acme.atlassian.net/browse/PROJ-455')).toBe(
      'PROJ-455',
    );
  });

  it('tolerates a trailing slash', () => {
    expect(currentTicketFromUrl('https://acme.atlassian.net/browse/PROJ-455/')).toBe(
      'PROJ-455',
    );
  });

  it('tolerates a query string', () => {
    expect(
      currentTicketFromUrl('https://acme.atlassian.net/browse/AB-12?focusedId=99'),
    ).toBe('AB-12');
  });

  it('tolerates an anchor', () => {
    expect(currentTicketFromUrl('https://acme.atlassian.net/browse/AB-12#comment')).toBe(
      'AB-12',
    );
  });

  it('uppercases the project key (Jira keys are upper)', () => {
    expect(currentTicketFromUrl('https://acme.atlassian.net/browse/proj-7')).toBe(
      'PROJ-7',
    );
  });

  it('supports multi-segment project keys with digits', () => {
    expect(currentTicketFromUrl('https://acme.atlassian.net/browse/ABC2-100')).toBe(
      'ABC2-100',
    );
  });

  it('returns undefined for a non-browse path', () => {
    expect(
      currentTicketFromUrl('https://acme.atlassian.net/jira/software/projects/PROJ/boards/1'),
    ).toBeUndefined();
  });

  it('returns undefined for a bare host', () => {
    expect(currentTicketFromUrl('https://acme.atlassian.net/')).toBeUndefined();
  });

  it('returns undefined when /browse/ has no valid key', () => {
    expect(currentTicketFromUrl('https://acme.atlassian.net/browse/')).toBeUndefined();
    expect(currentTicketFromUrl('https://acme.atlassian.net/browse/notakey')).toBeUndefined();
  });

  it('returns undefined for an unparseable URL', () => {
    expect(currentTicketFromUrl('not a url')).toBeUndefined();
  });

  it('does not match /browse substring inside other path segments', () => {
    expect(
      currentTicketFromUrl('https://acme.atlassian.net/wiki/browseSomething/PROJ-1'),
    ).toBeUndefined();
  });
});
