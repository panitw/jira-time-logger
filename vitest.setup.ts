// Global vitest setup: registers DOM matchers shared across the whole suite.
//
// 1. @testing-library/jest-dom — adds matchers like toBeInTheDocument /
//    toBeDisabled. Previously imported ad-hoc per test; now wired globally so
//    every component test (and the new a11y scan tests) share it.
// 2. vitest-axe — adds the `toHaveNoViolations` matcher used by the Story 6.1
//    accessibility audit gate (axe-core running inside jsdom).
import '@testing-library/jest-dom/vitest';
import { beforeEach, expect } from 'vitest';
import * as matchers from 'vitest-axe/matchers';
import { fakeBrowser } from 'wxt/testing/fake-browser';

expect.extend(matchers);

// 3. A default extension-API global, so `wxt/utils/storage` is usable at import
//    time.
//
//    `@wxt-dev/browser` resolves its `browser` export to `globalThis.chrome`
//    when `globalThis.browser` is absent — and under jsdom that is `undefined`.
//    That alone would be harmless if storage were only touched inside tests,
//    but `storage.defineItem()` (called at module scope in every lib/storage/*
//    module) ends with an unawaited `migrationsDone.then(getOrInitValue)`. That
//    chain reads `browser.runtime` with no `.catch()` attached, so merely
//    IMPORTING one of those modules threw an unhandled rejection into the void.
//    Assertions never saw it — the suite reported "1737 passed" alongside
//    "6 errors" and still exited non-zero.
//
//    Installing WXT's in-memory fake as the default makes that read succeed.
//    The ~26 test files that stub `chrome` themselves are unaffected: they
//    assign over this global, and `vi.unstubAllGlobals()` restores back to it.
//
//    Note this must be a plain assignment evaluated in a setup file, not a
//    `vi.mock`: `@wxt-dev/browser` captures `browser` once at module-evaluation
//    time, so the global has to exist before the first storage import runs.
globalThis.chrome = fakeBrowser as unknown as typeof chrome;

// Storage written by one test would otherwise still be there for the next one
// in the same file. Vitest isolates per FILE, not per test, so reset the fake
// between tests to keep them order-independent.
beforeEach(() => {
  fakeBrowser.reset();
});
