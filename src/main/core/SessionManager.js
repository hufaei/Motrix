import {
  copyFileSync,
  existsSync,
  renameSync,
  statSync,
  unlinkSync
} from 'fs'

export default class SessionManager {
  constructor ({ sessionPath, logger = console }) {
    this.sessionPath = sessionPath
    this.backupPath = `${sessionPath}.bak`
    this.logger = logger
  }

  prepare () {
    if (this.isValid(this.sessionPath)) {
      if (!this.isValid(this.backupPath)) {
        return this.copy(this.sessionPath, this.backupPath, 'seeded')
      }
      return 'ready'
    }

    if (this.isValid(this.backupPath)) {
      return this.copy(this.backupPath, this.sessionPath, 'restored')
    }

    return 'empty'
  }

  refreshBackup () {
    if (!this.exists(this.sessionPath)) {
      return false
    }

    return this.copy(this.sessionPath, this.backupPath, true)
  }

  reset () {
    let success = true
    const sessionFiles = [this.sessionPath, this.backupPath]
    sessionFiles.forEach((filePath) => {
      if (!existsSync(filePath)) {
        return
      }

      try {
        unlinkSync(filePath)
      } catch (err) {
        success = false
        this.warn(`Unable to remove session file ${filePath}`, err)
      }
    })
    return success
  }

  isValid (filePath) {
    try {
      const stat = statSync(filePath)
      return stat.isFile() && stat.size > 0
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.warn(`Unable to inspect session file ${filePath}`, err)
      }
      return false
    }
  }

  exists (filePath) {
    try {
      return statSync(filePath).isFile()
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.warn(`Unable to inspect session file ${filePath}`, err)
      }
      return false
    }
  }

  copy (source, destination, result) {
    const temporaryPath = `${destination}.tmp`
    try {
      copyFileSync(source, temporaryPath)
      renameSync(temporaryPath, destination)
      this.info(`[Motrix] Session file ${result === 'restored' ? 'restored' : 'backed up'}:`, destination)
      return result
    } catch (err) {
      this.warn(`Unable to copy session file to ${destination}`, err)
      return false
    } finally {
      if (existsSync(temporaryPath)) {
        try {
          unlinkSync(temporaryPath)
        } catch (err) {
          this.warn(`Unable to remove temporary session file ${temporaryPath}`, err)
        }
      }
    }
  }

  info (...args) {
    if (this.logger && typeof this.logger.info === 'function') {
      this.logger.info(...args)
    }
  }

  warn (...args) {
    if (this.logger && typeof this.logger.warn === 'function') {
      this.logger.warn('[Motrix]', ...args)
    }
  }
}
