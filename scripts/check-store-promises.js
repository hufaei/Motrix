'use strict'

process.env.BABEL_ENV = 'main'

const assert = require('assert')
const Module = require('module')
const path = require('path')

const api = {}
const originalLoad = Module._load
const originalResolveFilename = Module._resolveFilename

Module._load = function (request, parent, isMain) {
  if (request === '@/api') {
    return { __esModule: true, default: api }
  }
  if (request === '@/utils/native') {
    return { getSystemTheme: () => 'light' }
  }
  return originalLoad.apply(this, arguments)
}
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@shared/')) {
    request = path.join(__dirname, '..', 'src', 'shared', request.slice('@shared/'.length))
  } else if (request.startsWith('@/')) {
    request = path.join(__dirname, '..', 'src', 'renderer', request.slice('@/'.length))
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

require('@babel/register')({ extensions: ['.js'] })

const actions = require('../src/renderer/store/modules/app').default.actions

function deferred () {
  let finish
  const promise = new Promise(resolve => { finish = resolve })
  return { promise, resolve: finish }
}

async function assertWaitsForApi (actionName, methodName, value) {
  const request = deferred()
  api[methodName] = () => request.promise
  let settled = false
  const result = actions[actionName]({
    commit () {},
    dispatch () {}
  })
  assert(result && typeof result.then === 'function')
  result.then(() => { settled = true })
  await Promise.resolve()
  assert.strictEqual(settled, false, `${actionName} resolved before its API request`)
  request.resolve(value)
  await result
  assert.strictEqual(settled, true)
}

async function check () {
  await assertWaitsForApi('fetchEngineInfo', 'getVersion', {})
  await assertWaitsForApi('fetchEngineOptions', 'getGlobalOption', {})
  await assertWaitsForApi('fetchGlobalStat', 'getGlobalStat', {
    numActive: '0',
    downloadSpeed: '0'
  })
  await assertWaitsForApi('fetchProgress', 'fetchActiveTaskList', [])
}

check()
  .then(() => console.log('Store polling promise self-check passed'))
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
