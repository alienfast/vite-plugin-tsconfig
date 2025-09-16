import fs from 'node:fs'
import path from 'node:path'

import { findMonorepoRoot, Result } from '@alienfast/find-monorepo-root'
import { marked } from 'marked'
import TerminalRenderer from 'marked-terminal'
import { createLogger, LogLevel, Plugin } from 'vite'

import { revertTsConfig, Swapped, swapTsConfig } from './util.js'

marked.setOptions({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
  let buildActive = false
  let emergencyCleanupRegistered = false
  let processHandlers: Array<{ event: string; handler: (...args: any[]) => void }> = []

  // Emergency cleanup function
  const performCleanup = (reason: string) => {
    if (!buildActive || swapped.length === 0) {
      return
    }

    log.warn(`Performing emergency cleanup: ${reason}`)

    try {
      // Revert all swapped files
      for (const swap of swapped) {
        try {
          revertTsConfig(swap, log)
        } catch (error) {
          log.error(`Failed to revert tsconfig in ${swap.dir}: ${error}`)

          // Recovery validation - check if files were properly restored
          const tsconfigPath = path.resolve(swap.dir, TSCONFIG)
          const backupPath = swap.backupFilePath

          if (fs.existsSync(tsconfigPath) && hasBanner(tsconfigPath)) {
            log.warn(`Banner still present in ${tsconfigPath}, attempting manual cleanup`)
            try {
              try {
                fs.rmSync(tsconfigPath)
              } catch (rmError) {
                log.error(`Failed to remove generated tsconfig at ${tsconfigPath}: ${rmError}`)
                return // Cannot proceed with restoration if removal failed
              }

              if (backupPath && fs.existsSync(backupPath)) {
                try {
                  fs.renameSync(backupPath, tsconfigPath)
                  log.info(`Manually restored ${tsconfigPath} from backup`)
                } catch (renameError) {
                  log.error(
                    `Failed to restore backup ${backupPath} to ${tsconfigPath}: ${renameError}`,
                  )
                }
              }
            } catch (manualError) {
              log.error(`Manual cleanup failed for ${tsconfigPath}: ${manualError}`)
            }
          }
        }
      }
    } catch (error) {
      log.error(`Emergency cleanup failed: ${error}`)
    } finally {
      // Reset state regardless of cleanup success
      swapped.length = 0
      buildActive = false
    }
  }

  // Register process exit handlers for emergency cleanup
  const registerEmergencyCleanup = () => {
    if (emergencyCleanupRegistered) {
      return
    }

    emergencyCleanupRegistered = true

    const exitHandler = (signal: string) => {
      performCleanup(`Process ${signal}`)
      // Let Node.js handle termination naturally - don't call process.exit()
    }

    const sigintHandler = () => exitHandler('SIGINT')
    const sigtermHandler = () => exitHandler('SIGTERM')
    const exitExitHandler = () => performCleanup('Process exit')
    const uncaughtExceptionHandler = (error: Error) => {
      log.error(`Uncaught exception: ${error}`)
      performCleanup('Uncaught exception')
      // Let Node.js handle termination naturally - don't call process.exit()
    }
    const unhandledRejectionHandler = (reason: any) => {
      log.error(`Unhandled rejection: ${reason}`)
      performCleanup('Unhandled rejection')
      // Let Node.js handle termination naturally - don't call process.exit()
    }

    process.on('SIGINT', sigintHandler)
    process.on('SIGTERM', sigtermHandler)
    process.on('exit', exitExitHandler)
    process.on('uncaughtException', uncaughtExceptionHandler)
    process.on('unhandledRejection', unhandledRejectionHandler)

    // Track handlers for cleanup
    processHandlers = [
      { event: 'SIGINT', handler: sigintHandler },
      { event: 'SIGTERM', handler: sigtermHandler },
      { event: 'exit', handler: exitExitHandler },
      { event: 'uncaughtException', handler: uncaughtExceptionHandler },
      { event: 'unhandledRejection', handler: unhandledRejectionHandler },
    ]
  }

  // Cleanup process handlers to prevent memory leaks
  const cleanupProcessHandlers = () => {
    if (processHandlers.length > 0) {
      log.info('Cleaning up process event handlers')
      for (const { event, handler } of processHandlers) {
        process.removeListener(event, handler)
      }
      processHandlers = []
      emergencyCleanupRegistered = false
    }
  }

  const plugin: Plugin = {
    name: 'vite-plugin-tsconfig',

    config(config) {
      // Store root for use in buildStart
      root = config.root ?? process.cwd()
    },

    async buildStart() {
      try {
        // Prevent concurrent builds that could cause data loss
        if (buildActive) {
          throw new Error(
            'Build already active - concurrent builds are not supported to prevent tsconfig data loss',
          )
        }

        // Mark build as active
        buildActive = true

        // Register emergency cleanup handlers
        registerEmergencyCleanup()

        log.info('Starting tsconfig swap process')

        let monorepoRoot: Result | undefined
        try {
          monorepoRoot = await findMonorepoRoot(root)
        } catch (e) {
          log.warn(`Failed to find monorepo root: ${e}`)
        }

        log.info(`monorepoRoot: ${monorepoRoot ? monorepoRoot.dir : '(none)'}`)

        // e.g. if we are in a monorepo, but running vitest at the cwd of the package, we don't want to seek down from there and swap the tsconfig.json files
        const isAtMonoRepoRoot = monorepoRoot !== undefined && monorepoRoot.dir === root

        // swap the workspace tsconfig.json files
        if (isAtMonoRepoRoot && options.workspaces) {
          for (const workspace of options.workspaces) {
            const dir = path.resolve(root, workspace)
            if (!fs.existsSync(dir)) {
              throw new Error(`Expected workspace ${dir} to exist`)
            }

            try {
              const swap = swapTsConfig(filename, dir, log)
              swapped.push(swap)
            } catch (error) {
              log.error(`Failed to swap tsconfig in workspace ${dir}: ${error}`)
              // Continue with other workspaces but ensure cleanup happens
              throw new Error(`Workspace tsconfig swap failed for ${dir}: ${error}`)
            }
          }
        }

        // swap the root tsconfig.json file
        try {
          const swap = swapTsConfig(filename, root, log)
          swapped.push(swap)
        } catch (error) {
          log.error(`Failed to swap root tsconfig: ${error}`)
          throw new Error(`Root tsconfig swap failed: ${error}`)
        }

        log.info(`Successfully swapped ${swapped.length} tsconfig files`)
      } catch (error) {
        log.error(`buildStart failed: ${error}`)
        // Ensure cleanup happens even if setup fails
        performCleanup('buildStart failure')
        throw error
      }
    },

    buildEnd(error) {
      // Always attempt cleanup regardless of build success/failure
      try {
        if (!buildActive) {
          log.info('Build not active, skipping cleanup')
          return
        }

        if (error) {
          log.warn(`Build failed with error: ${error}. Performing cleanup.`)
        } else {
          log.info('Build completed successfully. Performing cleanup.')
        }

        if (swapped.length === 0) {
          log.info('No tsconfig files to revert')
          buildActive = false
          return
        }

        // Primary cleanup attempt
        const revertErrors: string[] = []
        for (const swap of swapped) {
          try {
            revertTsConfig(swap, log)
          } catch (revertError) {
            const errorMsg = `Failed to revert tsconfig in ${swap.dir}: ${revertError}`
            log.error(errorMsg)
            revertErrors.push(errorMsg)
          }
        }

        // If primary cleanup had errors, attempt emergency cleanup
        if (revertErrors.length > 0) {
          log.warn('Primary cleanup had errors, attempting emergency cleanup')

          for (const swap of swapped) {
            try {
              // Recovery validation - check if files were properly restored
              const tsconfigPath = path.resolve(swap.dir, TSCONFIG)
              const backupPath = swap.backupFilePath

              if (fs.existsSync(tsconfigPath) && hasBanner(tsconfigPath)) {
                log.warn(`Banner still present in ${tsconfigPath}, attempting manual cleanup`)

                // Manual cleanup with error handling
                try {
                  fs.rmSync(tsconfigPath)
                } catch (rmError) {
                  log.error(`Failed to remove generated tsconfig at ${tsconfigPath}: ${rmError}`)
                  return // Cannot proceed with restoration if removal failed
                }

                if (backupPath && fs.existsSync(backupPath)) {
                  try {
                    fs.renameSync(backupPath, tsconfigPath)
                    log.info(`Manually restored ${tsconfigPath} from backup`)
                  } catch (renameError) {
                    log.error(
                      `Failed to restore backup ${backupPath} to ${tsconfigPath}: ${renameError}`,
                    )
                  }
                } else {
                  log.warn(`No backup file to restore for ${tsconfigPath}`)
                }
              }
            } catch (emergencyError) {
              log.error(`Emergency cleanup failed for ${swap.dir}: ${emergencyError}`)
            }
          }
        }

        // Final validation - check that all files are properly restored
        const validationErrors: string[] = []
        for (const swap of swapped) {
          const tsconfigPath = path.resolve(swap.dir, TSCONFIG)

          if (fs.existsSync(tsconfigPath) && hasBanner(tsconfigPath)) {
            validationErrors.push(`Generated tsconfig still exists at ${swap.dir}`)
          }

          // Check for orphaned backup files
          if (swap.backupFilePath && fs.existsSync(swap.backupFilePath)) {
            validationErrors.push(`Backup file still exists at ${swap.backupFilePath}`)
          }
        }

        if (validationErrors.length > 0) {
          log.error('Cleanup validation failed:')
          validationErrors.forEach((error) => log.error(`  - ${error}`))
        } else {
          log.info('All tsconfig files successfully restored')
        }
      } catch (cleanupError) {
        log.error(`Critical error during buildEnd cleanup: ${cleanupError}`)

        // Last resort: emergency cleanup
        try {
          performCleanup('buildEnd critical error')
        } catch (emergencyError) {
          log.error(`Emergency cleanup also failed: ${emergencyError}`)
        }
      } finally {
        // Always reset state, even if cleanup failed
        swapped.length = 0
        buildActive = false

        // Cleanup process handlers to prevent memory leaks
        cleanupProcessHandlers()

        log.info('Build state reset')
      }
    },
  }

  return plugin
}

export default factory
