import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      tokens: {
        rules: {
          'no-dark-colors': {
            meta: { type: 'problem', schema: [], messages: { useToken: 'Use a semantic color token instead of a dark: color override.' } },
            create(context) {
              const check = (node, value) => {
                if (typeof value === 'string' && /\bdark:(?:hover:|focus:|placeholder:)?(?:text|bg|border|ring|fill|stroke)-/.test(value)) {
                  context.report({ node, messageId: 'useToken' })
                }
              }
              return {
                Literal: node => check(node, node.value),
                TemplateElement: node => check(node, node.value.raw),
              }
            },
          },
        },
      },
    },
    rules: { 'tokens/no-dark-colors': 'error' },
  },
])
