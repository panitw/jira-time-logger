import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDismissedResumeKeyMock = vi.fn(async (): Promise<string | null> => null);
const dismissResumeKeyMock = vi.fn(async (_key: string): Promise<void> => {});

vi.mock('@/lib/storage/resume-dismiss', () => ({
  getDismissedResumeKey: () => getDismissedResumeKeyMock(),
  dismissResumeKey: (key: string) => dismissResumeKeyMock(key),
}));

const { useResumeDismissal } = await import('./useResumeDismissal');

describe('useResumeDismissal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDismissedResumeKeyMock.mockResolvedValue(null);
  });

  it('starts undefined — "not read yet" is distinct from "nothing dismissed"', () => {
    // App.tsx holds the card at 'loading' on `undefined`; collapsing this to
    // `null` would render the card and then yank it away a tick later.
    const { result } = renderHook(() => useResumeDismissal());
    expect(result.current.dismissedKey).toBeUndefined();
  });

  it('resolves to null when storage has no dismissal', async () => {
    const { result } = renderHook(() => useResumeDismissal());
    await waitFor(() => {
      expect(result.current.dismissedKey).toBeNull();
    });
  });

  it('resolves to the persisted key', async () => {
    getDismissedResumeKeyMock.mockResolvedValue('PROJ-7');
    const { result } = renderHook(() => useResumeDismissal());
    await waitFor(() => {
      expect(result.current.dismissedKey).toBe('PROJ-7');
    });
  });

  it('dismiss() updates state optimistically AND persists', async () => {
    const { result } = renderHook(() => useResumeDismissal());
    await waitFor(() => {
      expect(result.current.dismissedKey).toBeNull();
    });

    act(() => {
      result.current.dismiss('PROJ-1');
    });

    // Synchronous — the card must hide on the click, not on the round-trip.
    expect(result.current.dismissedKey).toBe('PROJ-1');
    expect(dismissResumeKeyMock).toHaveBeenCalledWith('PROJ-1');
  });

  it('does not set state after unmount (no update-on-unmounted warning)', async () => {
    let release: (v: string | null) => void = () => {};
    getDismissedResumeKeyMock.mockReturnValue(
      new Promise<string | null>((resolve) => {
        release = resolve;
      }),
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderHook(() => useResumeDismissal());
    unmount();
    await act(async () => {
      release('PROJ-1');
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
