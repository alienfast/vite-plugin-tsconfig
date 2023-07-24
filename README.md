# vite-plugin-custom-tsconfig

[![NPM](https://img.shields.io/npm/v/vite-plugin-custom-tsconfig?style=for-the-badge)](https://www.npmjs.com/package/vite-plugin-custom-tsconfig/)

A very simple plugin to support using filenames like tsconfig.build.json or tsconfig.app.json with Vite. It copies your tsconfig.*.json to tsconfig.json before Vite starts, and removes it when the build is finished.

## Installation

**Using Yarn**

```bash
yarn add -D vite-plugin-custom-tsconfig
```

**Using pnpm**

```bash
pnpm add -D vite-plugin-custom-tsconfig
```

**Using npm**

```bash
npm install --save-dev vite-plugin-custom-tsconfig
```

## Usage

```ts
// vite.config.ts
import customTsConfig from 'vite-plugin-custom-tsconfig';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [
    customTsConfig({
      // default: 'tsconfig.build.json'
      filename: 'tsconfig.app.json',
    }),
  ],
});
```
