import fs from 'node:fs'
import path from 'node:path'

import { marked } from 'marked'
import TerminalRenderer from 'marked-terminal'
import { Logger } from 'vite'

import { BAK, BANNER, TSCONFIG } from './constants.js'

marked.setOptions({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  renderer: new TerminalRenderer() as any,
})

/**
 * Check if a tsconfig file has our generated banner
 */
export const hasBanner = (tsconfigPath: string): boolean => {
  try {
    const content = fs.readFileSync(tsconfigPath, 'utf8')
    return content.startsWith(BANNER.trim())
  } catch (error) {
    // If we can't read the file, assume it doesn't have our banner
    return false
  }
}

/**
 * Safely remove a file with error handling
 */
export const safeRemoveFile = (filePath: string, log: Logger): void => {
  try {
    fs.rmSync(filePath)
    log.info(`Removed file: ${filePath}`)
  } catch (error) {
    throw new Error(`Failed to remove file ${filePath}: ${error}`)
  }
}

/**
 * Safely rename a file with error handling
 */
export const safeRenameFile = (oldPath: string, newPath: string, log: Logger): void => {
  try {
    fs.renameSync(oldPath, newPath)
    log.info(`Renamed ${oldPath} to ${newPath}`)
  } catch (error) {
    throw new Error(`Failed to rename ${oldPath} to ${newPath}: ${error}`)
  }
}

/**
 * Perform manual backup restoration with comprehensive error handling
 */
export const performManualRestore = (
  tsconfigPath: string,
  backupPath: string | undefined,
  log: Logger,
): void => {
  if (!fs.existsSync(tsconfigPath) || !hasBanner(tsconfigPath)) {
    return
  }

  log.warn(`Banner still present in ${tsconfigPath}, attempting manual cleanup`)

  // Remove generated file
  safeRemoveFile(tsconfigPath, log)

  // Restore backup if it exists
  if (backupPath && fs.existsSync(backupPath)) {
    safeRenameFile(backupPath, tsconfigPath, log)
    log.info(`Manually restored ${tsconfigPath} from backup`)
  } else {
    log.warn(`No backup file to restore for ${tsconfigPath}`)
  }
}

export interface Swapped {
  dir: string
  backupFilePath: string | undefined
}

/**
 *
 * @param filename
 * @param dir
 * @param log
 */
export const swapTsConfig = (filename: string, dir: string, log: Logger): Swapped => {
  if (!fs.existsSync(dir)) {
    throw new Error(`Expected dir ${dir} to exist`)
  }

  const tsconfigPath = path.resolve(dir, TSCONFIG)
  let backupFilePath: string | undefined = undefined

  // if the tsconfig.json file already exists, we need to back it up and replace it later
  if (fs.existsSync(tsconfigPath)) {
    log.info(`${TSCONFIG} already exists, moving it to ${TSCONFIG}.${BAK} at ${dir}`)
    backupFilePath = path.resolve(dir, `${TSCONFIG}.${BAK}`)

    // paranoia check
    if (fs.existsSync(backupFilePath)) {
      safeRemoveFile(backupFilePath, log)
    }

    safeRenameFile(tsconfigPath, `${tsconfigPath}.${BAK}`, log)
  }

  // now
  const providedTsConfig = path.resolve(dir, filename)
  if (!fs.existsSync(providedTsConfig)) {
    throw new Error(`${providedTsConfig} does not exist.`)
  }

  log.info(`Creating ${TSCONFIG} from ${filename} at ${dir}`)
  let providedTsConfigContent: string
  try {
    providedTsConfigContent = fs.readFileSync(providedTsConfig, 'utf8')
  } catch (error) {
    throw new Error(`Failed to read source tsconfig ${providedTsConfig}: ${error}`)
  }

  try {
    fs.writeFileSync(tsconfigPath, BANNER + providedTsConfigContent)
  } catch (error) {
    throw new Error(`Failed to write generated tsconfig ${tsconfigPath}: ${error}`)
  }

  return { dir, backupFilePath }
}

export const revertTsConfig = (swapped: Swapped, log: Logger) => {
  const { dir, backupFilePath } = swapped
  if (!fs.existsSync(dir)) {
    throw new Error(`Expected dir ${dir} to exist`)
  }

  const tsconfigPath = path.resolve(dir, TSCONFIG)

  // perhaps we never created the tsconfig file?
  if (!fs.existsSync(tsconfigPath)) {
    log.info(`No tsconfig file found at ${dir}, nothing to do.`)
    return
  }

  // perhaps the user has a standard tsconfig file but we did not create it?
  if (!hasBanner(tsconfigPath)) {
    log.info(`tsconfig.json found at ${dir} but it does not contain theb banner, nothing to do.`)
    return
  }

  log.info(`Removing generated tsconfig.json at ${dir}`)
  safeRemoveFile(tsconfigPath, log)

  if (!backupFilePath) {
    log.info(`No backup file to restore at ${dir}`)
    return
  }

  if (fs.existsSync(backupFilePath)) {
    log.info(`Restoring ${TSCONFIG} from backup at ${dir}`)
    safeRenameFile(backupFilePath, tsconfigPath, log)
  } else {
    // at this point it is expected
    log.error(`Backup file ${backupFilePath} does not exist.`)
  }
}
