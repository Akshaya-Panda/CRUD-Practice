const fs = require('fs')
const path = require('path')
const { exec, spawn } = require('child_process')
const logger = require('../../../../util/logger')
const kill = require('tree-kill')
var log = logger.createLogger('iosutil')
var pythonProgram ;
var tunnelproccess;

let iosutil = {
  asciiparser: function(key) {
    switch (key) {
        case 'tab':
          return '\x09'
        case 'enter':
          return '\r'
        case 'del':
          return '\x08'
        // Disable keys (otherwise it sends the first character of key string on default case)
        case 'dpad_left':
          return '\v'
        case 'dpad_up':
          return '\0'
        case 'dpad_right':
          return '\f'
        case 'dpad_down':
          return '\x18'
        case 'caps_lock':
        case 'escape':
        case 'home':
          return null
        default:
          return key
    }
  },
  degreesToOrientation: function(degree) {
    switch (degree) {
      case 0:
        return 'PORTRAIT'
      case 90:
        return 'LANDSCAPE'
      case 180:
        return 'UIA_DEVICE_ORIENTATION_PORTRAIT_UPSIDEDOWN'
      case 270:
        return 'UIA_DEVICE_ORIENTATION_LANDSCAPERIGHT'
    }
  },
  pressButton: function(key) {
    switch (key) {
      case 'volume_up':
        return this.pressButton('volumeUp')
      case 'volume_down':
        return this.pressButton('volumeDown')
      case 'power':
        return this.pressPower()
      case 'camera':
        return this.appActivate('com.apple.camera')
      case 'search':
        return this.appActivate('com.apple.mobilesafari')
      case 'home':
        return this.homeBtn()
      case 'mute': {
        let i
          for(i = 0; i < 25; i++) {
            this.pressButton('volumeDown')
          }
          return true }

      // Media button requests in case there's future WDA compatibility
      case 'media_play_pause':
        return log.error('Non-existent button in WDA')
      case 'media_stop':
        return log.error('Non-existent button in WDA')
      case 'media_next':
        return log.error('Non-existent button in WDA')
      case 'media_previous':
        return log.error('Non-existent button in WDA')
      case 'media_fast_forward':
        return log.error('Non-existent button in WDA')
      case 'media_rewind':
        return log.error('Non-existent button in WDA')
      default:
        return this.pressButton(key)
    }
  },
  swipe: function(orientation, params, deviceSize) {
    switch(orientation) {
      case 'PORTRAIT':
        return {
          fromX: params.fromX * deviceSize.width,
          fromY: params.fromY * deviceSize.height,
          toX: params.toX * deviceSize.width,
          toY: params.toY * deviceSize.height,
          duration: params.duration
        }
      case 'LANDSCAPE':
        return {
          toX: params.fromY * deviceSize.width,
          toY: params.fromX * deviceSize.height,
          fromX: params.toY * deviceSize.width,
          fromY: params.toX * deviceSize.height,
          duration: params.duration
        }
      default:
        return {
          fromX: params.fromX * deviceSize.width,
          fromY: params.fromY * deviceSize.height,
          toX: params.toX * deviceSize.width,
          toY: params.toY * deviceSize.height,
          duration: params.duration
        }
    }
  },
  getUri: function(host, port) {
    return `http://${host}:${port}`
  },
  killWdaScriptProcess : async function() {
    console.log('Killing WDA start script:');
    kill(pythonProgram.pid);
    kill(tunnelproccess.pid);
    console.log('WDA start script killed successfully!');
  },
  runWdaScript: async function(host, appiumPort, UDID, wdaPort ) {
    return new Promise(async (resolve, reject) => {
      try {
        //python script to run wda on device
        const pythonScriptPath = path.join(__dirname,'..','..','..','..','..','vendor', 'wdaRunner.py')
        const defaults = { cwd: path.parse(pythonScriptPath).dir }
        console.log(defaults)
        log.info("spawn"+pythonScriptPath)
        pythonProgram = spawn('python3', [pythonScriptPath, `http://${host}:${appiumPort}`, UDID, wdaPort], defaults)
        log.info("python "+pythonScriptPath+` http://${host}:${appiumPort}`+ " "+UDID+ " "+wdaPort)
        pythonProgram.stdout.on('data', (data) => {
          if(data.toString().includes("wda started successfully")){
            resolve(true)
          }
          log.info('python_service: on data ' + data.toString())

        })

        pythonProgram.stdout.on('error', (data) => {
          log.info('python_service off data: ' + data.toString())
        })

        pythonProgram.stderr.on('data', (data) => {

          log.info('python_service stderr data: ' + data.toString())

          if(data.toString().includes("terminated")){
            const tunnelscript = path.join(__dirname,'..','..','..','..','..','vendor', 'startTunnel.py')
            tunnelproccess = spawn('python3', [tunnelscript, UDID, wdaPort], defaults)
            tunnelproccess.stdout.on('data', data => {
              log.info('tunnelproccess on data: ' + data.toString())
            })
            log.info("python "+tunnelscript+ " "+UDID+ " "+wdaPort)
          }
          if(data.toString().includes("File")){
            throw new Error(data.toString());
          }

        })

      } catch (error) {
        log.error(`Unable to start WDA ${error.stack}`)
        reject(error)
      }
    })
  }

}

module.exports = iosutil
