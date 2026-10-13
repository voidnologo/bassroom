import js from '@eslint/js'
import typescript from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

/**
 * Lint rules are split into three groups:
 *   - correctness (the recommended presets),
 *   - complexity budgets, which keep functions small enough to read in one pass,
 *   - project conventions that the rest of the codebase already follows.
 */
export default typescript.config(
  { ignores: ['dist/**', 'coverage/**', 'public/pitch-processor.js'] },

  js.configs.recommended,
  ...typescript.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',

      // Complexity budgets. These are deliberately strict: when one trips, the
      // fix is to extract a named function, which is nearly always the clearer
      // shape anyway.
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-nested-callbacks': ['error', 3],

      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
    },
  },

  {
    // React components are mostly JSX, which blows past a prose-sized line
    // budget without becoming harder to read.
    files: ['src/ui/**/*.tsx'],
    rules: {
      'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },

  {
    // Content modules are data, not logic: long literal note lists are the point.
    files: ['src/content/**/*.ts'],
    rules: { 'max-lines-per-function': 'off', 'max-depth': 'off' },
  },

  {
    // Tests are long by nature: a describe block is a list of cases, not a
    // function with branching logic.
    files: ['test/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'max-lines-per-function': 'off',
      'max-nested-callbacks': 'off',
      'max-params': ['error', 4],
    },
  },

  {
    // Tooling talks to a person at a terminal, which is what console is for.
    files: ['server/**/*.mjs', 'scripts/**', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off', '@typescript-eslint/no-explicit-any': 'off' },
  },
)
