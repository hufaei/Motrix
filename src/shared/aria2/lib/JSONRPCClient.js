'use strict'

import { EventEmitter } from 'events'
import _fetch from 'node-fetch'
import _WebSocket from 'ws'
import { JSONRPCError } from './JSONRPCError'

const Deferred = require('./Deferred')
const promiseEvent = require('./promiseEvent')

const WebSocket = global.WebSocket || _WebSocket
const fetch = global.fetch ? global.fetch.bind(global) : _fetch

export class JSONRPCClient extends EventEmitter {
  constructor (options) {
    super()
    this.deferreds = Object.create(null)
    this.lastId = 0

    Object.assign(this, this.defaultOptions, options)
  }

  id () {
    return this.lastId++
  }

  url (protocol) {
    return (
      protocol +
      (this.secure ? 's' : '') +
      '://' +
      this.host +
      ':' +
      this.port +
      this.path
    )
  }

  websocket (message) {
    return new Promise((resolve, reject) => {
      const cb = (err) => {
        if (err) reject(err)
        else resolve()
      }
      this.socket.send(JSON.stringify(message), cb)
      if (global.WebSocket && this.socket instanceof global.WebSocket) cb()
    })
  }

  async http (message) {
    const response = await fetch(this.url('http'), {
      method: 'POST',
      body: JSON.stringify(message),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`JSON-RPC HTTP ${response.status} ${response.statusText}`.trim())
    }

    this._onmessage(await response.json())
    return response
  }

  _buildMessage (method, params) {
    if (typeof method !== 'string') {
      throw new TypeError(method + ' is not a string')
    }

    const message = {
      method,
      'json-rpc': '2.0',
      id: this.id()
    }

    if (params) Object.assign(message, { params })
    return message
  }

  async batch (calls) {
    const message = calls.map(([method, params]) => {
      return this._buildMessage(method, params)
    })
    const promises = message.map(({ id }) => this._defer(id))

    this._send(message).catch((err) => {
      message.forEach(({ id }) => this._reject(id, err))
    })

    return promises
  }

  async call (method, parameters) {
    const message = this._buildMessage(method, parameters)
    const promise = this._defer(message.id)

    this._send(message).catch((err) => {
      this._reject(message.id, err)
    })

    return promise
  }

  _defer (id) {
    const deferred = (this.deferreds[id] = new Deferred())
    if (this.timeout > 0) {
      deferred.timer = setTimeout(() => {
        const error = new Error(`JSON-RPC request timed out after ${this.timeout} ms`)
        error.code = 'ETIMEDOUT'
        this._reject(id, error)
      }, this.timeout)
    }
    return deferred.promise
  }

  _takeDeferred (id) {
    const deferred = this.deferreds[id]
    if (!deferred) return
    clearTimeout(deferred.timer)
    delete this.deferreds[id]
    return deferred
  }

  _reject (id, err) {
    const deferred = this._takeDeferred(id)
    if (deferred) deferred.reject(err)
  }

  _rejectAll (err) {
    Object.keys(this.deferreds).forEach((id) => this._reject(id, err))
  }

  _toError (value, fallbackMessage) {
    if (value instanceof Error) return value
    if (value && value.error instanceof Error) return value.error
    return new Error((value && value.message) || fallbackMessage)
  }

  _emitError (err) {
    if (this.listenerCount('error') > 0) {
      this.emit('error', err)
    }
  }

  async _send (message) {
    this.emit('output', message)

    const { socket } = this
    return socket && socket.readyState === 1
      ? this.websocket(message)
      : this.http(message)
  }

  _onresponse ({ id, error, result }) {
    const deferred = this._takeDeferred(id)
    if (!deferred) return
    if (error) deferred.reject(new JSONRPCError(error))
    else deferred.resolve(result)
  }

  _onrequest ({ method, params }) {
    return this.onrequest(method, params)
  }

  _onnotification ({ method, params }) {
    this.emit(method, params)
  }

  _onmessage = (message) => {
    this.emit('input', message)

    if (Array.isArray(message)) {
      for (const object of message) {
        this._onobject(object)
      }
    } else {
      this._onobject(message)
    }
  }

  _onobject (message) {
    if (message.method === undefined) this._onresponse(message)
    else if (message.id === undefined) this._onnotification(message)
    else this._onrequest(message)
  }

  async open () {
    const socket = (this.socket = new WebSocket(this.url('ws')))

    socket.onclose = (...args) => {
      this._rejectAll(new Error('JSON-RPC connection closed'))
      this.emit('close', ...args)
    }
    socket.onmessage = (event) => {
      let message
      try {
        message = JSON.parse(event.data)
      } catch (err) {
        this._emitError(err)
        return
      }
      this._onmessage(message)
    }
    socket.onopen = (...args) => {
      this.emit('open', ...args)
    }
    socket.onerror = (event) => {
      const err = this._toError(event, 'JSON-RPC WebSocket error')
      this._rejectAll(err)
      this._emitError(err)
    }

    return promiseEvent(this, 'open')
  }

  async close () {
    const { socket } = this
    const closed = promiseEvent(this, 'close')
    socket.close()
    return closed
  }

  defaultOptions = {
    secure: false,
    host: 'localhost',
    port: 80,
    secret: '',
    path: '/jsonrpc',
    timeout: 15 * 1000,
    fetch,
    WebSocket
  }
}
