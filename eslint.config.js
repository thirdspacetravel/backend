export default [
  {
    ignores: ['dist', 'node_modules'],
  },

  eslint.configs.recommended,

  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },

    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettier,
    },

    rules: {
      // Add TypeScript recommended rules
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs['recommended-type-checked'].rules,

      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },

  // Apply prettier config last to override conflicting rules
  prettierConfig,
];
