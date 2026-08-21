'use strict'

process.env.BABEL_ENV = 'main'

const assert = require('assert')

let fetchResponse
global.fetch = async () => fetchResponse

class FakeWebSocket {
  constructor () {
    this.readyState = 1
    Promise.resolve().then(() => this.onopen())
  }

  send () {}

  close () {
    this.readyState = 3
    this.onclose({ code: 1000 })
  }
}

global.WebSocket = FakeWebSocket
require('@babel/register')({ extensions: ['.js'] })

const { JSONRPCClient } = require('../src/shared/aria2/lib/JSONRPCClient')

async function check () {
  const immediate = new JSONRPCClient({ timeout: 100 })
  immediate._send = async function (message) {
    this._onmessage({ id: message.id, result: 'ok' })
  }
  assert.strictEqual(await immediate.call('immediate'), 'ok')

  const immediateBatch = new JSONRPCClient({ timeout: 100 })
  immediateBatch._send = async function (messages) {
    this._onmessage(messages.map(({ id }) => ({ id, result: id })))
  }
  const batch = await immediateBatch.batch([['one'], ['two']])
  assert.deepStrictEqual(await Promise.all(batch), [0, 1])

  const sendFailure = new JSONRPCClient({ timeout: 100 })
  const sendError = new Error('send failed')
  sendFailure._send = async () => { throw sendError }
  await assert.rejects(sendFailure.call('fail'), sendError)
  assert.deepStrictEqual(Object.keys(sendFailure.deferreds), [])

  const timeout = new JSONRPCClient({ timeout: 10 })
  timeout._send = () => new Promise(() => {})
  await assert.rejects(timeout.call('timeout'), { code: 'ETIMEDOUT' })
  assert.deepStrictEqual(Object.keys(timeout.deferreds), [])

  fetchResponse = { ok: false, status: 503, statusText: 'Unavailable' }
  const badStatus = new JSONRPCClient({ timeout: 100 })
  await assert.rejects(badStatus.call('http'), /JSON-RPC HTTP 503/)
  assert.deepStrictEqual(Object.keys(badStatus.deferreds), [])

  fetchResponse = {
    ok: true,
    json: async () => { throw new SyntaxError('bad JSON') }
  }
  const badJson = new JSONRPCClient({ timeout: 100 })
  await assert.rejects(badJson.call('json'), SyntaxError)
  assert.deepStrictEqual(Object.keys(badJson.deferreds), [])

  const closed = new JSONRPCClient({ timeout: 100 })
  await closed.open()
  const pending = closed.call('pending')
  await closed.close()
  await assert.rejects(pending, /connection closed/)
  assert.deepStrictEqual(Object.keys(closed.deferreds), [])

  const socketFailure = new JSONRPCClient({ timeout: 100 })
  await socketFailure.open()
  const socketPending = socketFailure.call('pending')
  socketFailure.socket.onerror(new Error('post-open failure'))
  await assert.rejects(socketPending, /post-open failure/)
  assert.deepStrictEqual(Object.keys(socketFailure.deferreds), [])

  const observedFailure = new JSONRPCClient({ timeout: 100 })
  let observedError
  observedFailure.on('error', err => { observedError = err })
  await observedFailure.open()
  observedFailure.socket.onmessage({ data: 'not-json' })
  assert(observedError instanceof SyntaxError)
}

check()
  .then(() => console.log('JSONRPCClient self-check passed'))
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
