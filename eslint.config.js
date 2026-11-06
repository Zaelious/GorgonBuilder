import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/**', 'coverage/**', '.wrangler/**', 'worker/worker-configuration.d.ts']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['*.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
            message: 'Keep core logic independent of React.',
          },
          {
            group: ['**/app', '**/app/**', '**/features', '**/features/**', '**/styles', '**/styles/**'],
            message: 'Core logic must not depend on UI code.',
          },
        ],
      }],
    },
  },
  {
    files: ['worker/**/*.ts'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['worker/**/*.test.ts', 'worker/testing/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // T0018: backend contracts and the Worker stay independent of React/UI, and production code
    // can never import the test-only in-memory repository or test helpers.
    files: ['src/persistence/remote/**/*.ts', 'worker/**/*.ts'],
    ignores: ['**/*.test.ts', '**/testing/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
            message: 'Keep backend and persistence contracts independent of React.',
          },
          {
            group: ['**/app', '**/app/**', '**/features', '**/features/**', '**/styles', '**/styles/**'],
            message: 'Backend code must not depend on UI code.',
          },
          {
            group: ['**/testing', '**/testing/**'],
            message: 'Test-only fakes and helpers must not be imported by production code.',
          },
        ],
      }],
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}', 'src/main.tsx'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/persistence/remote/testing', '**/persistence/remote/testing/**'], message: 'The in-memory BuildRepository is test-only.' }],
      }],
    },
  },
);
