import fs from 'node:fs'
import path from 'node:path'

import { marked } from 'marked'
import TerminalRenderer from 'marked-terminal'
import { Logger } from 'vite'

marked.setOptions({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  renderer: new TerminalRenderer() as any,
})

const TSCONFIG = 'tsconfig.json'
const BANNER = `// GENERATED via 'vite-plugin-tsconfig' - this should be automatically created and deleted inside the build process. \n`
const BAK = 'bak.vite-plugin-tsconfig'

const hasBanner = (tsconfigPath: string) => {
  const content = fs.readFileSync(tsconfigPath, 'utf8')
  return content.startsWith(BANNER.trim())
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
  if (!fs.existsSync) {
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
      fs.rmSync(backupFilePath)
    }

    fs.renameSync(tsconfigPath, `${tsconfigPath}.${BAK}`)
  }

  // now
  const providedTsConfig = path.resolve(dir, filename)
  if (!fs.existsSync(providedTsConfig)) {
    throw new Error(`${providedTsConfig} does not exist.`)
  }

  log.info(`Creating ${TSCONFIG} from ${filename} at ${dir}`)
  const providedTsConfigContent = fs.readFileSync(providedTsConfig, 'utf8')
  fs.writeFileSync(tsconfigPath, BANNER + providedTsConfigContent)

  return { dir, backupFilePath }
}

export const revertTsConfig = (swapped: Swapped, log: Logger) => {
  const { dir, backupFilePath } = swapped
  if (!fs.existsSync) {
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
  fs.rmSync(tsconfigPath)

  if (!backupFilePath) {
    log.info(`No backup file to restore at ${dir}`)
    return
  }

  if (fs.existsSync(backupFilePath)) {
    log.info(`Restoring ${TSCONFIG} from backup at ${dir}`)
    fs.renameSync(backupFilePath, tsconfigPath)
  } else {
    // at this point it is expected
    log.error(`Backup file ${backupFilePath} does not exist.`)
  }
}
