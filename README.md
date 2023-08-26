![MIT](https://img.shields.io/github/license/alienfast/vite-plugin-tsconfig?style=for-the-badge)
![Version](https://img.shields.io/github/package-json/v/alienfast/vite-plugin-tsconfig?style=for-the-badge)
![CI](https://img.shields.io/github/actions/workflow/status/alienfast/vite-plugin-tsconfig/release.yml?style=for-the-badge)
![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=for-the-badge)

# vite-plugin-tsconfig

`yarn add -D vite-plugin-tsconfig`

Vite plugin to that allows you to specify an alternate tsconfig filename.

```ts
import { defineConfig } from 'vite'
import tsconfig from 'vite-plugin-tsconfig'

export default defineConfig({
  plugins: [
    tsconfig({
      filename: 'tsconfig.build.json',

      // optional
      logLevel: 'info',

      // optional
      workspaces: ['packages/ui', 'packages/notifications'],
    }),
  ],
})
```

## Features

- allows a default `tsconfig.json`, in the end it will be put back in place
- allows specifying `workspaces` for monorepo packages to be swapped at the same time as the root

## Why?

As of 7/26/2023, `vite` does not allow users to specify alternate tsconfig files. Given a variety of needs including different development
vs CI environments, it is common to use different tsconfig files to meet such needs.

Preferably, this plugin should become obsolete if `vite` includes the option to specify an alternate tsconfig.

## How does it work?

It's a total hack. In the `config` stage, if a current `tsconfig.json` exists, it will back it up. Once that is complete, it will write the content from the provided
alternate tsconfig file to the default filename of `tsconfig.json`. When the build is finishing, it will remove the generated file and replace the original (if one existed).

## `workspaces` - why?

In monorepos, and specifically as we have seen with storybook usage and local tsconfig paths usage in development but not production, `vite` will try and `loadTsconfigJsonForFile`,
which resolves as the package's `tsconfig.json` _regardless_ of what the root level `tsconfig.json` specifies. This means that if your development configurations contain
anythin incompatible with your CI/production configurations, vite is going to break. We added the `workspaces` property to allow this same file-swapping hack to operate
in the workspace packages. We specifically did not try and read the root's `package.json` `workspaces` property because it may contain other packages that are irrelevant
or that you do not want to provide the additional tsconfig `filename` to swap.

## Contributing

PRs are accepted! This project is configured with `auto`, so feel free to submit a PR and `auto` will automatically create a `canary` release for you to try out.
