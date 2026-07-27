import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PopupSkeletonBody } from './PopupSkeletonBody';

describe('PopupSkeletonBody (AC1)', () => {
  it('renders no spinner anywhere — no animate-spin, no svg (LoaderCircle) at all', () => {
    const { container } = render(<PopupSkeletonBody />);
    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders only animate-skeleton pulses, and is aria-hidden (carries no information of its own)', () => {
    const { container } = render(<PopupSkeletonBody />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('.animate-skeleton').length).toBeGreaterThan(1);
  });

  it('carries no self -mt-[10px] — the baseline break lives on <main> only (Obligation 2 / D-7.3-3)', () => {
    const { container } = render(<PopupSkeletonBody />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain('-mt-[10px]');
  });
});
