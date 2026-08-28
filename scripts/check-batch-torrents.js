'use strict'

process.env.BABEL_ENV = 'main'

const assert = require('assert')
const crypto = require('crypto')
const fs = require('fs')
const net = require('net')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

require('@babel/register')({ extensions: ['.js'] })

const { Aria2 } = require('../src/shared/aria2')

const PROJECT_ROOT = path.resolve(__dirname, '..')

function delay (milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function encodeBencode (value) {
  if (Buffer.isBuffer(value)) {
    return Buffer.concat([Buffer.from(`${value.length}:`), value])
  }

  if (typeof value === 'string') {
    return encodeBencode(Buffer.from(value))
  }

  if (Number.isInteger(value)) {
    return Buffer.from(`i${value}e`)
  }

  if (Array.isArray(value)) {
    return Buffer.concat([
      Buffer.from('l'),
      ...value.map(encodeBencode),
      Buffer.from('e')
    ])
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort((left, right) => {
      return Buffer.compare(Buffer.from(left), Buffer.from(right))
    })
    const entries = keys.flatMap((key) => [
      encodeBencode(key),
      encodeBencode(value[key])
    ])
    return Buffer.concat([Buffer.from('d'), ...entries, Buffer.from('e')])
  }

  throw new TypeError(`Cannot bencode value of type ${typeof value}`)
}

function createTorrent (name, pieceByte) {
  return encodeBencode({
    announce: 'http://127.0.0.1:9/announce',
    info: {
      length: 1,
      name,
      'piece length': 16384,
      pieces: Buffer.alloc(20, pieceByte)
    }
  })
}

function findAria2Binary () {
  const platform = process.platform
  const executable = platform === 'win32' ? 'aria2c.exe' : 'aria2c'
  const architectureCandidates = [process.arch]

  if (platform === 'win32' && process.arch === 'arm64') {
    architectureCandidates.push('x64')
  }

  for (const architecture of architectureCandidates) {
    const candidate = path.join(
      PROJECT_ROOT,
      'extra',
      platform,
      architecture,
      'engine',
      executable
    )
    if (fs.existsSync(candidate)) {
      return { candidate, architecture }
    }
  }

  throw new Error(
    `No bundled aria2 executable for ${platform}/${process.arch} under extra/`
  )
}

function reservePort () {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function waitForExit (child, timeout) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit)
      resolve(false)
    }, timeout)
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('exit', onExit)
  })
}

async function waitForRpc (client, child, getSpawnError, getStderr) {
  const deadline = Date.now() + 10000
  let lastError

  while (Date.now() < deadline) {
    const spawnError = getSpawnError()
    if (spawnError) throw spawnError
    if (child.exitCode !== null) {
      throw new Error(
        `aria2 exited before RPC was ready (code ${child.exitCode}):\n${getStderr()}`
      )
    }

    try {
      await client.call('getVersion')
      return
    } catch (error) {
      lastError = error
      await delay(100)
    }
  }

  throw new Error(`aria2 RPC did not become ready: ${lastError || 'timeout'}`)
}

async function waitForTaskStatus (client, gid, expectedStatus) {
  const deadline = Date.now() + 5000
  let task

  while (Date.now() < deadline) {
    task = await client.call('tellStatus', gid, [
      'status',
      'errorCode',
      'errorMessage'
    ])
    if (task.status === expectedStatus) return task
    await delay(50)
  }

  throw new Error(
    `Task ${gid} did not reach ${expectedStatus}: ${JSON.stringify(task)}`
  )
}

function assertSuccessfulGid (result) {
  assert.ok(Array.isArray(result), 'successful multicall item must be an array')
  assert.strictEqual(result.length, 1)
  assert.match(result[0], /^[0-9a-f]{16}$/i)
  return result[0]
}

function assertRpcError (result) {
  assert.ok(result && !Array.isArray(result), 'failed multicall item must be an object')
  assert.strictEqual(typeof result.code, 'number')
  assert.strictEqual(typeof result.message, 'string')
}

async function stopAria2 (client, child) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return

  if (client) {
    try {
      await client.call('forceShutdown')
    } catch (_) {}
  }

  if (await waitForExit(child, 2000)) return

  child.kill()
  if (await waitForExit(child, 2000)) return

  if (process.platform !== 'win32') child.kill('SIGKILL')
  await waitForExit(child, 2000)
}

async function check () {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'motrix-batch-torrents-'))
  const downloadDirectory = path.join(temporaryRoot, 'downloads')
  const configurationPath = path.join(temporaryRoot, 'aria2.conf')
  const sessionPath = path.join(temporaryRoot, 'aria2.session')
  let child
  let client

  fs.mkdirSync(downloadDirectory)
  fs.writeFileSync(configurationPath, '')
  fs.writeFileSync(sessionPath, '')

  try {
    const { candidate: executable, architecture } = findAria2Binary()
    const rpcPort = await reservePort()
    let peerPort = await reservePort()
    while (peerPort === rpcPort) peerPort = await reservePort()
    const secret = crypto.randomBytes(18).toString('hex')
    const argumentsList = [
      `--conf-path=${configurationPath}`,
      '--enable-rpc=true',
      '--rpc-listen-all=false',
      `--rpc-listen-port=${rpcPort}`,
      `--rpc-secret=${secret}`,
      `--listen-port=${peerPort}`,
      `--dir=${downloadDirectory}`,
      `--save-session=${sessionPath}`,
      '--file-allocation=none',
      '--enable-dht=false',
      '--enable-dht6=false',
      '--enable-peer-exchange=false',
      '--bt-enable-lpd=false',
      '--console-log-level=warn',
      '--summary-interval=0'
    ]
    let spawnError
    let stderr = ''

    child = spawn(executable, argumentsList, {
      cwd: temporaryRoot,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true
    })
    child.on('error', (error) => { spawnError = error })
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-32768)
    })

    client = new Aria2({
      host: '127.0.0.1',
      port: rpcPort,
      secret,
      timeout: 2000
    })
    await waitForRpc(client, child, () => spawnError, () => stderr)

    const firstBatch = await client.multicall([
      ['addTorrent', createTorrent('batch-one.bin', 1).toString('base64'), [], { pause: 'true' }],
      ['addTorrent', createTorrent('batch-two.bin', 2).toString('base64'), [], { pause: 'true' }]
    ])
    assert.strictEqual(firstBatch.length, 2)
    const firstGids = firstBatch.map(assertSuccessfulGid)
    assert.strictEqual(new Set(firstGids).size, 2, 'each torrent must create its own task')

    const waiting = await client.call('tellWaiting', 0, 100, ['gid', 'status'])
    assert.strictEqual(waiting.length, 2, 'tellWaiting must contain exactly two tasks')
    assert.deepStrictEqual(
      new Set(waiting.map(({ gid }) => gid)),
      new Set(firstGids)
    )

    const partialBatch = await client.multicall([
      ['addTorrent', createTorrent('batch-three.bin', 3).toString('base64'), [], { pause: 'true' }],
      ['addTorrent', Buffer.from('not a bencoded torrent').toString('base64'), [], { pause: 'true' }]
    ])
    assert.strictEqual(partialBatch.length, 2)
    assertSuccessfulGid(partialBatch[0])
    assertRpcError(partialBatch[1])

    const collisionName = 'existing-file.bin'
    fs.writeFileSync(path.join(downloadDirectory, collisionName), Buffer.alloc(9, 7))
    const collisionGid = await client.call(
      'addTorrent',
      createTorrent(collisionName, 4).toString('base64'),
      [],
      { pause: 'false', 'allow-overwrite': 'false' }
    )
    const collisionTask = await waitForTaskStatus(client, collisionGid, 'error')
    assert.strictEqual(collisionTask.errorCode, '13')
    assert.match(collisionTask.errorMessage, /exists/i)

    const architectureNote = architecture === process.arch
      ? `${process.platform}/${architecture}`
      : `${process.platform}/${process.arch} via ${architecture}`
    console.log(`Batch torrent integration check passed (${architectureNote})`)
  } finally {
    await stopAria2(client, child)
    fs.rmSync(temporaryRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100
    })
  }
}

check().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
