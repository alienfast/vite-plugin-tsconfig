# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Vite plugin that allows specifying alternate tsconfig files. **Note: This plugin is no longer necessary in MOST cases** as of Vite 7.1.5, which now supports alternate tsconfig files natively via `optimizeDeps.esbuildOptions.tsconfig`. However, it is **still necessary in monorepos that make extensive use of externalized paths**.

## Architecture

The plugin works by temporarily swapping tsconfig files:

- `src/index.ts` - Main plugin factory and configuration logic
- `src/util.ts` - Core file swapping utilities (`swapTsConfig`, `revertTsConfig`)

The plugin operates in two phases:

1. **config hook**: Backs up existing `tsconfig.json`, writes alternate config file content to `tsconfig.json`
2. **closeBundle hook**: Restores original `tsconfig.json` from backup

## Commands

### Build and Development

```bash
yarn build          # Clean and build using tsup
yarn clean          # Remove dist directory
yarn typecheck      # Run TypeScript compiler check
```

### Code Quality

```bash
yarn lint           # Run ESLint with cache
yarn lint:fix       # Run ESLint with auto-fix
```

### Testing

```bash
yarn test           # Currently no tests (exits 0)
```

### Release

```bash
yarn release        # Create release using auto
```

## Build System

- **Bundler**: tsup (configured in `tsup.config.ts`)
- **Output**: ESM format only, with sourcemaps and TypeScript declarations
- **TypeScript**: Extends `@alienfast/tsconfig/node.json`
- **Linting**: Uses `@alienfast/eslint-config` with custom ignores

## Package Management

- Uses Yarn 4.9.4 (Berry)
- ESM-only package with proper exports configuration
- Configured for automatic releases via `auto` tool
