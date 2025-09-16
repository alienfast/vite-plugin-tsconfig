import fs from 'node:fs'
import path from 'node:path'

import { findMonorepoRoot, Result } from '@alienfast/find-monorepo-root'
import { marked } from 'marked'
import TerminalRenderer from 'marked-terminal'
import { createLogger, LogLevel, Plugin } from 'vite'

import { CleanupManager } from './cleanup-manager.js'
import { ProcessHandlerManager } from './process-handler-manager.js'
import { Swapped, swapTsConfig } from './util.js'

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

const factory = (options: PluginOptions) => {
  const { filename, logLevel = 'warn' } = options
  const log = createLogger(logLevel, { prefix: '[tsconfig]' })

  let root: string
  const swapped: Swapped[] = []
  let buildActive = false

  const cleanupManager = new CleanupManager(log)
  const processHandlerManager = new ProcessHandlerManager(log)

  // Emergency cleanup function
  const performCleanup = (reason: string) => {
    if (!buildActive || swapped.length === 0) {
      return
    }

    log.warn(`Performing emergency cleanup: ${reason}`)

    try {
      cleanupManager.performCompleteCleanup(swapped, reason)
    } catch (error) {
      log.error(`Emergency cleanup failed: ${error}`)
    } finally {
      // Reset state regardless of cleanup success
      swapped.length = 0
      buildActive = false
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
        processHandlerManager.registerEmergencyCleanup(performCleanup)

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

        const reason = error ? `Build failed with error: ${error}` : 'Build completed successfully'

        log.info(`${reason}. Performing cleanup.`)

        if (swapped.length === 0) {
          log.info('No tsconfig files to revert')
          buildActive = false
          return
        }

        // Use CleanupManager for comprehensive cleanup
        cleanupManager.performCompleteCleanup(swapped, reason)
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
        processHandlerManager.cleanup()

        log.info('Build state reset')
      }
    },
  }

  return plugin
}

export default factory
