#!/usr/bin/env node
'use strict'

const bodyParser = require('body-parser')
const express = require('express')
const medUtils = require('openhim-mediator-utils')
const request = require('request')
const url = require('url')

const utils = require('./utils')

// Config
var config = {} // this will vary depending on whats set in openhim-core
const apiConf = require('../config/config')
const mediatorConfig = require('../config/mediator')

var port = mediatorConfig.endpoints[0].port

/**
 * setupApp - configures the http server for this mediator
 *
 * @return {express.App}  the configured http server
 */
function setupApp () {
  const app = express()
  app.use(bodyParser.raw({type: '*/*', limit: '100mb'}))

  app.all('*', (req, res) => {
    console.log(`Processing ${req.method} request on ${req.url}`)

    const clientId = req.get('x-openhim-clientid')
    
    let instanceId = req.query.instanceid
    if(typeof instanceId === 'undefined'){
      instanceId = ''      
    }
      
    let mapping = null
    if (config.mapping) {
      config.mapping.forEach((map) => {
        if (map.clientID === clientId  && map.instanceID === instanceId) {
          mapping = map
        }
      })
    }

    // remove request specific headers
    delete req.headers.host
    delete req.headers['content-length']

    const urlObj = url.parse(config.upstreamURL)
    urlObj.pathname = req.path
    urlObj.search = url.parse(req.url).search
    const options = {
      url: url.format(urlObj),
      method: req.method,
      headers: req.headers,
      timeout: 600000
    }
    let bodyString = ''
    if (Buffer.isBuffer(req.body)) {
      options.body = req.body
      bodyString = req.body.toString()
    }
    if (mapping) {
      options.headers.Authorization = 'Basic ' + new Buffer(`${mapping.username}:${mapping.password}`).toString('base64')
    }

    console.log('Sending upstream request')
    request(options, (err, upstreamRes, upstreamBody) => {
      console.log('Recieved upstream response')
      if (err) {
        console.log(err.stack)
        res.set('Content-Type', 'application/json+openhim')
        return res.send(utils.buildReturnObject(mediatorConfig.urn, 'Failed', 500, {}, err.message))
      }

      // capture orchestration data
      var orchestrationResponse = { statusCode: upstreamRes.statusCode, headers: upstreamRes.headers }
      let orchestrations = []
      orchestrations.push(utils.buildOrchestration('Upstream request', new Date().getTime(), options.method, options.url, options.headers, bodyString, orchestrationResponse, upstreamBody))

      // set content type header so that OpenHIM knows how to handle the response
      res.set('Content-Type', 'application/json+openhim')

      // construct return object
      console.log('Responding to OpenHIM')
      res.send(utils.buildReturnObject(mediatorConfig.urn, 'Successful', 200, upstreamRes.headers, upstreamBody, orchestrations))
    })
  })
  return app
}

/**
 * start - starts the mediator
 *
 * @param  {Function} callback a node style callback that is called once the
 * server is started
 */
function start (callback) {
  if (apiConf.api.trustSelfSigned) { process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0' }

  if (apiConf.register) {
    medUtils.registerMediator(apiConf.api, mediatorConfig, (err) => {
      if (err) {
        console.log('Failed to register this mediator, check your config')
        console.log(err.stack)
        process.exit(1)
      }
      apiConf.api.urn = mediatorConfig.urn
      medUtils.fetchConfig(apiConf.api, (err, newConfig) => {
        console.log('Received initial config:')
        console.log(JSON.stringify(newConfig))
        config = newConfig
        if (err) {
          console.log('Failed to fetch initial config')
          console.log(err.stack)
          process.exit(1)
        } else {
          console.log('Successfully registered mediator!')
          let app = setupApp()
          const server = app.listen(port, () => {
            let configEmitter = medUtils.activateHeartbeat(apiConf.api)
            configEmitter.on('config', (newConfig) => {
              console.log('Received updated config:')
              console.log(JSON.stringify(newConfig))
              // set new config for mediator
              config = newConfig
            })
            callback(server)
          })
          server.setTimeout(600000)
          console.log('Server timeout is: ' + server.timeout)
        }
      })
    })
  } else {
    // default to config from mediator registration
    config = mediatorConfig.config
    let app = setupApp()
    const server = app.listen(port, () => callback(server))
    server.setTimeout(600000)
    console.log('Server timeout is: ' + server.timeout)
  }
}
exports.start = start

if (!module.parent) {
  // if this script is run directly, start the server
  start(() => console.log(`Listening on ${port}...`))
}
