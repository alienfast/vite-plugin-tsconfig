import fs from 'node:fs'
import path from 'node:path'

import { marked } from 'marked'
import TerminalRenderer from 'marked-terminal'
import { createLogger, LogLevel, Plugin } from 'vite'

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
  let backupFilename: string

  const plugin: Plugin = {
    name: 'vite-plugin-tsconfig',

    config(config) {
      root ??= config.root ?? process.cwd()

      const tsconfigPath = path.resolve(root, TSCONFIG)

      // if the tsconfig file already exists, we need to back it up and replace it later
      if (fs.existsSync(tsconfigPath)) {
        log.info(`${TSCONFIG} already exists, moving it to ${TSCONFIG}.bak`)
        backupFilename = path.resolve(root, `${TSCONFIG}.bak`)

        // paranoia check
        if (fs.existsSync(backupFilename)) {
          fs.rmSync(backupFilename)
        }

        fs.renameSync(tsconfigPath, `${tsconfigPath}.bak`)
      }

      // now
      const providedTsConfig = path.resolve(root, filename)
      if (!fs.existsSync(providedTsConfig)) {
        throw new Error(`${providedTsConfig} does not exist.`)
      }

      log.info(`Creating ${TSCONFIG} from ${filename}`)
      const providedTsConfigContent = fs.readFileSync(providedTsConfig, 'utf8')
      fs.writeFileSync(tsconfigPath, BANNER + providedTsConfigContent)
    },

    closeBundle() {
      if (!root) {
        throw new Error('Expected root to be set in the vite config hook.')
      }

      const tsconfigPath = path.resolve(root, TSCONFIG)

      // perhaps we never created the tsconfig file?
      if (!fs.existsSync(tsconfigPath)) {
        log.info('No tsconfig file found, nothing to do.')
        return
      }

      // perhaps the user has a standard tsconfig file but we did not create it?
      if (!hasBanner(tsconfigPath)) {
        log.info('tsconfig.json found but it does not contain theb banner, nothing to do.')
        return
      }

      log.info('Removing generated tsconfig.json')
      fs.rmSync(tsconfigPath)

      if (fs.existsSync(backupFilename)) {
        log.info(`Restoring ${TSCONFIG} from backup`)
        moveSync(backupFilename, tsconfigPath)
      }
    },
  }

  return plugin
}

export default factory
