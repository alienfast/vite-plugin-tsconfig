import fs from 'node:fs'
import path from 'node:path'

import { Logger } from 'vite'

import { TSCONFIG } from './constants.js'
import { hasBanner, performManualRestore, revertTsConfig, Swapped } from './util.js'

export interface CleanupValidationResult {
  validationErrors: string[]
  hasErrors: boolean
}

/**
 * Manages cleanup operations for swapped tsconfig files
 */
export class CleanupManager {
  constructor(private log: Logger) {}

  /**
   * Perform primary cleanup by reverting all swapped files
   */
  public performPrimaryCleanup(swapped: Swapped[]): string[] {
    const revertErrors: string[] = []

    for (const swap of swapped) {
      try {
        revertTsConfig(swap, this.log)
      } catch (revertError) {
        const errorMsg = `Failed to revert tsconfig in ${swap.dir}: ${revertError}`
        this.log.error(errorMsg)
        revertErrors.push(errorMsg)
      }
    }

    return revertErrors
  }

  /**
   * Perform emergency manual cleanup for files that failed primary cleanup
   */
  public performEmergencyCleanup(swapped: Swapped[]): void {
    this.log.warn('Performing emergency manual cleanup')

    for (const swap of swapped) {
      try {
        const tsconfigPath = path.resolve(swap.dir, TSCONFIG)
        performManualRestore(tsconfigPath, swap.backupFilePath, this.log)
      } catch (emergencyError) {
        this.log.error(`Emergency cleanup failed for ${swap.dir}: ${emergencyError}`)
      }
    }
  }

  /**
   * Validate that all cleanup operations were successful
   */
  public validateCleanup(swapped: Swapped[]): CleanupValidationResult {
    const validationErrors: string[] = []

    for (const swap of swapped) {
      const tsconfigPath = path.resolve(swap.dir, TSCONFIG)

      // Check for generated files that weren't properly removed
      if (fs.existsSync(tsconfigPath) && hasBanner(tsconfigPath)) {
        validationErrors.push(`Generated tsconfig still exists at ${swap.dir}`)
      }

      // Check for orphaned backup files
      if (swap.backupFilePath && fs.existsSync(swap.backupFilePath)) {
        validationErrors.push(`Backup file still exists at ${swap.backupFilePath}`)
      }
    }

    return {
      validationErrors,
      hasErrors: validationErrors.length > 0,
    }
  }

  /**
   * Perform complete cleanup with fallbacks and validation
   */
  public performCompleteCleanup(swapped: Swapped[], reason: string): CleanupValidationResult {
    if (swapped.length === 0) {
      this.log.info('No tsconfig files to clean up')
      return { validationErrors: [], hasErrors: false }
    }

    this.log.info(`Performing cleanup: ${reason}`)

    // Primary cleanup attempt
    const revertErrors = this.performPrimaryCleanup(swapped)

    // Emergency cleanup if primary had errors
    if (revertErrors.length > 0) {
      this.performEmergencyCleanup(swapped)
    }

    // Final validation
    const validation = this.validateCleanup(swapped)

    if (validation.hasErrors) {
      this.log.error('Cleanup validation failed:')
      validation.validationErrors.forEach((error) => this.log.error(`  - ${error}`))
    } else {
      this.log.info('All tsconfig files successfully restored')
    }

    return validation
  }
}
