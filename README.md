![MIT](https://img.shields.io/github/license/alienfast/vite-plugin-tsconfig?style=for-the-badge)
![Version](https://img.shields.io/github/package-json/v/alienfast/vite-plugin-tsconfig?style=for-the-badge)
![CI](https://img.shields.io/github/actions/workflow/status/alienfast/vite-plugin-tsconfig/release.yml?style=for-the-badge)
![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=for-the-badge)

# vite-plugin-tsconfig

`yarn add -D vite-plugin-tsconfig`

Vite plugin to that allows you to specify an alternate tsconfig.

```ts
import { defineConfig } from 'vite'
import tsconfig from 'vite-plugin-tsconfig'

export default defineConfig({
  plugins: [
    tsconfig({
      filename: 'tsconfig.build.json',

      logLevel: 'info', // optional for additional information
    }),
  ],
})
```

## Why?

As of 7/26/2023, `vite` does not allow users to specify alternate tsconfig files. Given a variety of needs including different development
vs CI environments, it is common to use different tsconfig files to meet such needs.

Preferably, this plugin should become obsolete if `vite` includes the option to specify an alternate tsconfig.

## How does it work?

It's a total hack. In the `config` stage, if a current `tsconfig.json` exists, it will back it up. Once that is complete, it will write the content from the provided
alternate tsconfig file to the default filename of `tsconfig.json`. When the build is finishing, it will remove the generated file and replace the original (if one existed).

## Contributing

PRs are accepted! This project is configured with `auto`, so feel free to submit a PR and `auto` will automatically create a `canary` release for you to try out.
