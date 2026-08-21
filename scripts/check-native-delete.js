'use strict'

process.env.BABEL_ENV = 'main'

const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const os = require('os')
const path = require('path')

const trashed = []
const originalLoad = Module._load
const originalResolveFilename = Module._resolveFilename

Module._load = function (request, parent, isMain) {
  if (request === '@electron/remote') {
    return {
      shell: {
        trashItem: async filePath => { trashed.push(filePath) },
        showItemInFolder () {},
        async openPath () { return '' }
      },
      nativeTheme: { shouldUseDarkColors: false }
    }
  }
  if (request === 'element-ui') {
    return { Message: { error () {} } }
  }
  return originalLoad.apply(this, arguments)
}
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@shared/')) {
    request = path.join(__dirname, '..', 'src', 'shared', request.slice('@shared/'.length))
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

require('@babel/register')({ extensions: ['.js'] })

const { moveTaskFilesToTrash } = require('../src/renderer/utils/native')

async function check () {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'motrix-delete-'))
  try {
    const taskDirectory = path.join(root, 'downloads')
    const inside = path.join(taskDirectory, 'inside.bin')
    const control = `${inside}.aria2`
    const outside = path.join(root, 'outside.bin')
    fs.mkdirSync(taskDirectory)
    fs.writeFileSync(inside, 'data')
    fs.writeFileSync(control, 'control')
    fs.writeFileSync(outside, 'outside')

    await moveTaskFilesToTrash({
      dir: taskDirectory,
      status: 'active',
      files: [{ path: inside }]
    })
    assert.deepStrictEqual(trashed, [inside, control])

    await assert.rejects(moveTaskFilesToTrash({
      dir: taskDirectory,
      status: 'active',
      files: [{ path: outside }]
    }), /task\.file-path-error/)
    assert.deepStrictEqual(trashed, [inside, control])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

check()
  .then(() => console.log('Native delete self-check passed'))
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
