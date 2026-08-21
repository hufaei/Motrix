'use strict'

process.env.BABEL_ENV = 'main'

const assert = require('assert')
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')

require('@babel/register')({ extensions: ['.js'] })

const SessionManager = require('../src/main/core/SessionManager').default
const logger = { info () {}, warn () {} }

function withSession (check) {
  const directory = mkdtempSync(join(tmpdir(), 'motrix-session-'))
  const sessionPath = join(directory, 'download.session')
  const backupPath = `${sessionPath}.bak`
  const manager = new SessionManager({ sessionPath, logger })

  try {
    check({ manager, sessionPath, backupPath })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function check () {
  withSession(({ manager, sessionPath, backupPath }) => {
    writeFileSync(sessionPath, 'first session')
    assert.strictEqual(manager.prepare(), 'seeded')
    assert.strictEqual(readFileSync(backupPath, 'utf8'), 'first session')

    writeFileSync(sessionPath, 'new session')
    assert.strictEqual(manager.prepare(), 'ready')
    assert.strictEqual(readFileSync(backupPath, 'utf8'), 'first session')
    assert.strictEqual(manager.refreshBackup(), true)
    assert.strictEqual(readFileSync(backupPath, 'utf8'), 'new session')
  })

  withSession(({ manager, sessionPath, backupPath }) => {
    writeFileSync(sessionPath, '')
    writeFileSync(backupPath, 'backup session')
    assert.strictEqual(manager.prepare(), 'restored')
    assert.strictEqual(readFileSync(sessionPath, 'utf8'), 'backup session')
  })

  withSession(({ manager, sessionPath, backupPath }) => {
    writeFileSync(backupPath, 'backup session')
    assert.strictEqual(manager.prepare(), 'restored')
    assert.strictEqual(readFileSync(sessionPath, 'utf8'), 'backup session')
  })

  withSession(({ manager, sessionPath, backupPath }) => {
    writeFileSync(sessionPath, 'old session')
    assert.strictEqual(manager.prepare(), 'seeded')
    writeFileSync(sessionPath, '')
    assert.strictEqual(manager.refreshBackup(), true)
    assert.strictEqual(readFileSync(backupPath, 'utf8'), '')
    assert.strictEqual(manager.prepare(), 'empty')
    assert.strictEqual(readFileSync(sessionPath, 'utf8'), '')
  })

  withSession(({ manager, sessionPath, backupPath }) => {
    writeFileSync(sessionPath, 'current session')
    writeFileSync(backupPath, 'backup session')
    assert.strictEqual(manager.reset(), true)
    assert.strictEqual(existsSync(sessionPath), false)
    assert.strictEqual(existsSync(backupPath), false)
    assert.strictEqual(manager.prepare(), 'empty')
    assert.strictEqual(existsSync(sessionPath), false)
  })
}

try {
  check()
  console.log('SessionManager self-check passed')
} catch (err) {
  console.error(err)
  process.exitCode = 1
}
