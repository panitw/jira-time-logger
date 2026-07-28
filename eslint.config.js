import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
// `eslint-plugin-import-x`, not `eslint-plugin-import`: the latter calls
// `sourceCode.getTokenOrCommentAfter`, removed in ESLint 10, and its latest
// release (2.32.0) still declares a peer range topping out at ESLint 9. We need
// ESLint 10 because ESLint 9 pins minimatch ^3, which pins brace-expansion ^1 —
// and the fix for the brace-expansion OOM advisory (GHSA, vulnerable <=5.0.7
// across ALL majors) exists only in 5.0.8. import-x is the maintained fork and
// a drop-in for the one rule we use; `import/order` is spelled `import-x/order`.
import importX from 'eslint-plugin-import-x';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['node_modules/', 'output/', '.output/', '.wxt/', 'dist/', 'coverage/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'import-x': importX,
    },
    rules: {
      // === No defaults, no any, no console.log ===
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Default exports are forbidden — use named exports only.',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'debug', 'info'] }],

      // === Naming conventions (architecture.md patterns) ===
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'interface', format: ['PascalCase'] },
        { selector: 'function', format: ['camelCase', 'PascalCase'] },
        { selector: 'variable', format: ['camelCase', 'PascalCase', 'UPPER_CASE'], leadingUnderscore: 'allow' },
        {
          selector: 'variable',
          modifiers: ['const', 'global'],
          format: ['camelCase', 'PascalCase', 'UPPER_CASE', 'snake_case'],
        },
        {
          selector: 'variable',
          modifiers: ['exported'],
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
        },
      ],

      // === Import order ===
      'import-x/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
          ],
          'newlines-between': 'never',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // === React hooks ===
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // === Unused imports / vars ===
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Tests + config files relax some rules
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.config.{js,ts,mjs}', 'eslint.config.js'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  // WXT-required default export in entrypoints
  {
    files: ['entrypoints/**/*.ts', 'entrypoints/**/*.tsx', 'wxt.config.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  // Node build/release scripts (e.g. scripts/pack-crx.mjs) — Node runtime globals
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
);
