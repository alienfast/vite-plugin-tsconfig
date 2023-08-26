import fs from 'node:fs'
import path from 'node:path'

import { marked } from 'marked'
import TerminalRenderer from 'marked-terminal'
import { createLogger, LogLevel, Plugin } from 'vite'

import { revertTsConfig, Swapped, swapTsConfig } from './util'

marked.setOptions({
  renderer: new TerminalRenderer() as any,
})

// unfortunately not exported
export const LogLevels: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
}

export interface PluginOptions {
  /**
   * Set to 'info' for noisy information.
   *
   * Default: 'warn'
   */
  logLevel?: LogLevel

  /**
   * Name of the replacement tsconfig file to use
   */
  filename: string

  /**
   * Relative paths to packages that should also have their tsconfig.json files swapped. e.g. ['packages/foo', 'packages/bar']
   */
  workspaces?: string[]
}

const TSCONFIG = 'tsconfig.json'
const BANNER = `// GENERATED via 'vite-plugin-tsconfig' - this should be automatically created and deleted inside the build process. \n`

const hasBanner = (tsconfigPath: string) => {
  const content = fs.readFileSync(tsconfigPath, 'utf8')
  return content.startsWith(BANNER.trim())
}

const factory = (options: PluginOptions) => {
  const { filename, logLevel = 'warn' } = options
  const log = createLogger(logLevel, { prefix: '[tsconfig]' })

  let root: string
  const swapped: Swapped[] = []

  const plugin: Plugin = {
    name: 'vite-plugin-tsconfig',

    config(config) {
      root ??= config.root ?? process.cwd()

      // swap the workspace tsconfig.json files
      if (options.workspaces) {
        for (const workspace of options.workspaces) {
          const dir = path.resolve(root, workspace)
          if (!fs.existsSync(dir)) {
            throw new Error(`Expected workspace ${dir} to exist`)
          }

          const swap = swapTsConfig(filename, dir, log)
          swapped.push(swap)
        }
      }

      // swap the root tsconfig.json file
      const swap = swapTsConfig(filename, root, log)
      swapped.push(swap)
    },

    closeBundle() {
      if (!root) {
        throw new Error('Expected root to be set in the vite config hook.')
      }

      // revert the tsconfig.json files
      for (const swap of swapped) {
        revertTsConfig(swap, log)
      }
    },
  }

  return plugin
}

export default factory
