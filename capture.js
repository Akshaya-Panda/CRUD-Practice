var util = require('util')
const path = require('path')
const os = require('os')
const fs = require('fs')

var syrup = require('@devicefarmer/stf-syrup')
var adbkit = require('@devicefarmer/adbkit')

var logger = require('../../../../util/logger')
var wire = require('../../../../wire')
var wireutil = require('../../../../wire/util')

module.exports = syrup.serial()
  .dependency(require('../../support/adb'))
  .dependency(require('../../support/router'))
  .dependency(require('../../support/push'))
  .dependency(require('../../support/storage'))
  .dependency(require('../../resources/minicap'))
  .dependency(require('../util/display'))
  .define(function(options, adb, router, push, storage, minicap, display) {
    var log = logger.createLogger('device:plugins:screen:capture')
    var plugin = Object.create(null)
    
    const storageFolder = `${os.homedir()}/tmdc/storage`

    function projectionFormat() {
      return util.format(
        '%dx%d@%dx%d/%d'
      , display.properties.width
      , display.properties.height
      , display.properties.width
      , display.properties.height
      , display.properties.rotation
      )
    }

    plugin.capture = function() {
      log.info('Capturing screenshot')

      var file = util.format('/data/local/tmp/minicap_%d.jpg', Date.now())
      return minicap.run('minicap-apk', util.format(
          '-P %s -s >%s', projectionFormat(), file))
        .then(adbkit.util.readAll)
        .then(function() {
          return adb.stat(options.serial, file)
        })
        .then(function(stats) {
          if (stats.size === 0) {
            throw new Error('Empty screenshot; possibly secure screen?')
          }
          
          let screensData = ''
          return adb.pull(options.serial, file)
            .then(function(transfer) {
              screensData = storage.store('image', transfer, {
                filename: util.format('%s.jpg', options.serial)
              , contentType: 'image/jpeg'
              , knownLength: stats.size
              })
              return screensData;
            })
        })
        . finally(function() {
          return adb.shell(options.serial, ['rm', '-f', file])
            .then(adbkit.util.readAll)
        })
    }
    
    plugin.captureForTestAssist = function (username) {
      log.info('Capturing screenshot')

      const now = new Date()
      const file = util.format('/data/local/tmp/minicap_%d.jpg', Date.now())
     /* let tempPath = storage.store('image', transfer, {
        filename: util.format('%s.jpg', options.serial)
      , contentType: 'image/jpeg'
      , knownLength: stats.size
      })
      console.log(tempPath,"###############################################") */
      return minicap.run('minicap-apk', util.format(
        '-P %s -s >%s', projectionFormat(), file))
        .then(adbkit.util.readAll)
        .then(function () {
          return adb.stat(options.serial, file)
        })
        .then(function (stats) {
          if (stats.size === 0) {
            throw new Error('Empty screenshot; possibly secure screen?')
          }
          
          function removeFileFromDevice() {
            adb.shell(options.serial, ['rm', '-f', file])
              .then(adbkit.util.readAll)
          }
           
          return new Promise((resolve, reject) => {
            return adb.pull(options.serial, file)
              .then(function (transfer) {
                const datestamp = now.toISOString().slice(0, 10)
                const timestamp = now.toISOString().replace("T", "_").replace(/:/g, "").split(".")[0]
                const filename = `${options.serial}_${timestamp}.jpg`
                const pathname = path.join(storageFolder, datestamp, username, 'screenshots')  
                
                if(!fs.existsSync(pathname)) {
                  fs.mkdirSync(pathname)
                }
                
                const writeStream = fs.createWriteStream(path.join(pathname, filename), { flags: 'w'})
                transfer.pipe(writeStream)  
                
                writeStream.on('close', () => {
                  
                  tempPath = storage.store('image', transfer, {
                    filename: util.format('%s.jpg', options.serial)
                  , contentType: 'image/jpeg'
                  , knownLength: stats.size
                  })
                  removeFileFromDevice()
                  return resolve({
                    name: filename,
                    path: pathname,
                    timestamp: now,
                    tempPath: tempPath
                  })
                })
                writeStream.on('error', (err) => {
                  removeFileFromDevice()
                  reject(err)
                })
              })
          })
        })
    }

    router.on(wire.ScreenCaptureMessage, function(channel) {
      var reply = wireutil.reply(options.serial)
      plugin.capture()
        .then(function(file) {
          push.send([
            channel
          , reply.okay('success', file)
          ])
        })
        .catch(function(err) {
          log.error('Screen capture failed', err.stack)
          push.send([
            channel
          , reply.fail(err.message)
          ])
        })
    })

    return plugin
  })
