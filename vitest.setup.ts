// Global vitest setup: registers DOM matchers shared across the whole suite.
//
// 1. @testing-library/jest-dom — adds matchers like toBeInTheDocument /
//    toBeDisabled. Previously imported ad-hoc per test; now wired globally so
//    every component test (and the new a11y scan tests) share it.
// 2. vitest-axe — adds the `toHaveNoViolations` matcher used by the Story 6.1
//    accessibility audit gate (axe-core running inside jsdom).
import '@testing-library/jest-dom/vitest';
import { expect } from 'vitest';
import * as matchers from 'vitest-axe/matchers';

expect.extend(matchers);
