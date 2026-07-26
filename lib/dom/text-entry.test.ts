import { describe, it, expect } from 'vitest';
import { isTextEntryElement } from './text-entry';

describe('isTextEntryElement', () => {
  it('null is not a text-entry element', () => {
    expect(isTextEntryElement(null)).toBe(false);
  });

  it('a <textarea> is a text-entry element', () => {
    expect(isTextEntryElement(document.createElement('textarea'))).toBe(true);
  });

  it('a contenteditable element is a text-entry element', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    expect(isTextEntryElement(div)).toBe(true);
    div.remove();
  });

  it.each(['text', 'search', 'date', 'email', 'number', 'tel', 'url', 'password'])(
    'an <input type="%s"> is a text-entry element',
    (type) => {
      const input = document.createElement('input');
      input.type = type;
      expect(isTextEntryElement(input)).toBe(true);
    },
  );

  it.each(['button', 'checkbox', 'color', 'file', 'radio', 'range', 'reset', 'submit'])(
    'an <input type="%s"> is NOT a text-entry element',
    (type) => {
      const input = document.createElement('input');
      input.type = type;
      expect(isTextEntryElement(input)).toBe(false);
    },
  );

  it('a plain <button> is not a text-entry element', () => {
    expect(isTextEntryElement(document.createElement('button'))).toBe(false);
  });

  it('a bare <div> (not contenteditable) is not a text-entry element', () => {
    expect(isTextEntryElement(document.createElement('div'))).toBe(false);
  });
});
