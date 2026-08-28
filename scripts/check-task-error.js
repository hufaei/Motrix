'use strict'

process.env.BABEL_ENV = 'main'

const assert = require('assert')

require('@babel/register')({ extensions: ['.js'] })

const {
  getTaskErrorPresentation,
  hasTaskError
} = require('../src/renderer/utils/taskError')

function translate (key, params = {}) {
  const values = Object.keys(params)
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join(',')
  return values ? `${key}(${values})` : key
}

const collision = getTaskErrorPresentation({
  errorCode: '13',
  errorMessage: 'File already exists.'
}, translate)

assert.strictEqual(hasTaskError({ errorCode: '13' }), true)
assert.strictEqual(hasTaskError({ errorCode: '0' }), false)
assert.strictEqual(hasTaskError({}), false)
assert.strictEqual(collision.reason, 'task.download-error-file-exists-reason')
assert.strictEqual(collision.suggestion, 'task.download-error-file-exists-suggestion')
assert.match(collision.reasonWithCode, /errorCode=13/)
assert.match(collision.original, /File already exists\./)
assert.match(collision.detail, /task\.download-error-file-exists-suggestion/)

const generic = getTaskErrorPresentation({
  errorCode: '7',
  errorMessage: 'Network problem.'
}, translate)

assert.strictEqual(generic.reason, 'Network problem.')
assert.strictEqual(generic.original, '')
assert.strictEqual(generic.suggestion, 'task.download-error-generic-suggestion')

console.log('Task error presentation self-check passed')
