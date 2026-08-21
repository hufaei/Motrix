'use strict'

process.env.BABEL_ENV = 'main'

const assert = require('assert')
const Module = require('module')
const path = require('path')

const originalResolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@shared/')) {
    request = path.join(__dirname, '..', 'src', 'shared', request.slice('@shared/'.length))
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

require('@babel/register')({ extensions: ['.js'] })

const EngineClient = require('../src/main/core/EngineClient').default

async function check () {
  const client = new EngineClient({ secret: 'rpc-secret' })
  const calls = []
  client.client = {
    call: async (...args) => {
      calls.push(args)
      return 'ok'
    }
  }

  assert.strictEqual(await client.shutdown({ force: true }), 'ok')
  assert.deepStrictEqual(calls.pop(), ['forceShutdown'])

  assert.strictEqual(await client.shutdown(), 'ok')
  assert.deepStrictEqual(calls.pop(), ['shutdown'])
}

check()
  .then(() => console.log('EngineClient self-check passed'))
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
