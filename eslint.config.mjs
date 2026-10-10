/**
 * ESLint Flat Config — strongest practical static analysis for the
 * HackTrip Node.js + TypeScript backend (Express 4 / Prisma / MySQL / Zod).
 *
 * Layers:
 *   1. global ignores (generated output only — never business logic)
 *   2. base recommended + security + promise for the whole tree
 *   3. plain JS / MJS tooling & config scripts: JS rules + Node globals,
 *      no TypeScript project parsing
 *   4. src TypeScript files: full type-aware strict + strictTypeChecked plus
 *      selected stylistic rules, and security + promise over runtime source
 */
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import security from 'eslint-plugin-security';
import promise from 'eslint-plugin-promise';

export default tseslint.config(
  // 1. Generated output and third-party code — never linted.
  {
    ignores: ['build/**', 'dist/**', 'coverage/**', 'node_modules/**'],
  },

  // 2. Core JavaScript recommended + security + promise for the whole tree.
  eslint.configs.recommended,
  security.configs.recommended,
  promise.configs['flat/recommended'],

  // 3. Plain JS / MJS config & tooling files: JS rules + Node globals, but
  //    no type-aware project parsing (they are not in the tsconfig program).
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2022 },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
    },
  },

  // 4. TypeScript application source under src/: full type-aware strict
  //    profile. projectService drives type-aware rules without listing files.
  {
    files: ['src/**/*.ts'],
    extends: [...tseslint.configs.strict, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // --- type-safety & correctness kept at error ------------------------
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/unbound-method': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowNullish: false, allowRegExp: false },
      ],
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-duplicate-type-constituents': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/no-redundant-type-constituents': 'error',
    },
  },

  // 5. Promise + security + core-JS correctness rules specific to runtime
  //    source (override the global layer where stricter handling applies).
  {
    files: ['src/**/*.ts'],
    rules: {
      // --- promise correctness -------------------------------------------
      'promise/catch-or-return': 'error',
      'promise/always-return': 'error',
      'promise/no-return-wrap': 'error',
      'promise/param-names': 'error',
      'promise/no-nesting': 'warn',
      'promise/no-promise-in-callback': 'warn',
      'promise/no-callback-in-promise': 'warn',
      'promise/avoid-new': 'off',
      'promise/prefer-await-to-then': 'warn',
      'promise/prefer-await-to-callbacks': 'off',

      // --- Node.js security ----------------------------------------------
      // object-injection stays off for TS source: TypeScript already blocks
      // the unsafe patterns it flags on well-typed code, and the rule is
      // notoriously noisy on legitimate dictionary/map access.
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-require': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'error',

      // --- core JS correctness -------------------------------------------
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-duplicate-imports': 'error',
      'no-fallthrough': 'error',
      'no-promise-executor-return': 'error',
      'no-return-assign': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',
      'no-unsafe-finally': 'error',
      'no-async-promise-executor': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
      'valid-typeof': 'error',
      'require-atomic-updates': 'error',
      'no-await-in-loop': 'warn',
    },
  },
);
