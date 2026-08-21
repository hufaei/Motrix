import NatAPI from '@motrix/nat-api'

import logger from './Logger'

let client = null
const mappingStatus = {}
const mappingPromises = {}

export default class UPnPManager {
  constructor (options = {}) {
    this.options = {
      ...options
    }
  }

  init () {
    if (client) {
      return
    }

    client = new NatAPI({
      autoUpdate: true
    })
  }

  map (port) {
    if (!port) {
      return Promise.reject(new Error('[Motrix] port was not specified'))
    }

    if (mappingStatus[port]) {
      return Promise.resolve()
    }

    if (mappingPromises[port]) {
      return mappingPromises[port]
    }

    this.init()

    mappingPromises[port] = new Promise((resolve, reject) => {
      logger.info('[Motrix] UPnPManager port mapping: ', port)
      try {
        client.map(port, (err) => {
          if (err) {
            logger.warn(`[Motrix] UPnPManager map ${port} failed, error: `, err.message)
            reject(err)
            return
          }

          mappingStatus[port] = true
          logger.info(`[Motrix] UPnPManager port ${port} mapping succeeded`)
          resolve()
        })
      } catch (err) {
        reject(err)
      }
    })

    return mappingPromises[port].finally(() => {
      delete mappingPromises[port]
    })
  }

  unmap (port) {
    this.init()

    return new Promise((resolve, reject) => {
      logger.info('[Motrix] UPnPManager port unmapping: ', port)
      if (!port) {
        reject(new Error('[Motrix] port was not specified'))
        return
      }

      if (!mappingStatus[port]) {
        resolve()
        return
      }

      try {
        client.unmap(port, (err) => {
          if (err) {
            logger.warn(`[Motrix] UPnPManager unmap ${port} failed, error: `, err)
            reject(err)
            return
          }

          logger.info(`[Motrix] UPnPManager port ${port} unmapping succeeded`)
          mappingStatus[port] = false
          resolve()
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  closeClient () {
    if (!client) {
      return
    }

    const currentClient = client
    client = null
    Object.keys(mappingStatus).forEach(port => {
      delete mappingStatus[port]
    })

    try {
      currentClient.destroy(() => {})
    } catch (err) {
      logger.warn('[Motrix] close UPnP client fail', err)
    }
  }
}
