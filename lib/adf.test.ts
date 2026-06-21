import { describe, it, expect } from 'vitest';
import { textToAdf, adfToText } from './adf';

describe('textToAdf', () => {
  it('wraps a string in a minimal ADF doc', () => {
    expect(textToAdf('hi')).toEqual({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hi' }],
        },
      ],
    });
  });
});

describe('adfToText', () => {
  it('extracts text from a valid ADF doc', () => {
    const doc = textToAdf('hello world');
    expect(adfToText(doc)).toBe('hello world');
  });

  it('concatenates multiple text nodes in the first paragraph', () => {
    const doc = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'foo' },
            { type: 'text', text: 'bar' },
          ],
        },
      ],
    };
    expect(adfToText(doc)).toBe('foobar');
  });

  it('returns "" for undefined', () => {
    expect(adfToText(undefined)).toBe('');
  });

  it('returns "" for a plain string (legacy / unexpected shape)', () => {
    expect(adfToText('not adf')).toBe('');
  });

  it('returns "" for garbage / unexpected shapes without throwing', () => {
    expect(adfToText({})).toBe('');
    expect(adfToText({ content: 'nope' })).toBe('');
    expect(adfToText({ content: [{}] })).toBe('');
    expect(adfToText(null)).toBe('');
    expect(adfToText(42)).toBe('');
  });
});
