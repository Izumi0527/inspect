import { dirname } from 'path'
import { fileURLToPath } from 'url'

import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 用 FlatCompat 桥接 eslintrc 风格的 eslint-config-next（next 暂未提供原生 flat 导出）。
const compat = new FlatCompat({ baseDirectory: __dirname })

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  // 等价于旧 .eslintrc.json 的默认忽略，并显式排除构建产物/依赖，
  // 以及 next lint 此前不纳入的 CJS 配置/工具文件与 Next 生成文件。
  {
    ignores: [
      '.next/**',
      'out/**',
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'next-env.d.ts',
      'next.config.js',
      'jest.config.js',
      'print-lines.js',
      'scripts/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // 自 .eslintrc.json 迁移而来的项目规则。
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'react/display-name': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/exhaustive-deps': 'off',
      '@next/next/no-img-element': 'off',
    },
  },
]

export default eslintConfig
