const syrup = require('@devicefarmer/stf-syrup')
const lifecycle = require('../../../util/lifecycle')
const wire = require('../../../wire')
const wireutil = require('../../../wire/util')
const wirerouter = require('../../../wire/router');
const dbapi = require('../../../db/api')
const masterZeromqutil = require('../plugins/util/masterZeromqutil');
const { serial } = require('@devicefarmer/stf-syrup/lib/syrup');
const zmqutil = require('../../../util/zmqutil')
const srv = require('../../../util/srv')
const Promise = require('bluebird')
const logger = require('../../../util/logger')


module.exports = syrup.serial()
  .dependency(require('../support/push'))
  .dependency(require('../support/sub'))
  .dependency(require('../support/router'))
  .define(async (options, push, sub ,router) => {
    //console.log("option value@@@@@@@@@@@@@@@@@@@@@@@",options)
    const log = logger.createLogger('device:plugins:heartbeat')
    let counterFatal = 0;
    var setResponseObject = {}
    const deviceData = await dbapi.getDeviceById(options.serial)
    await masterZeromqutil.initializePush(options)
    await masterZeromqutil.initializeSub(options)

    async function retryPushConnection() {
      log.info('Attempting to reconnect push socket for device:', options.serial)
      try {
        push = zmqutil.socket('push')
        await Promise.map(options.endpoints.push, endpoint => {
          return srv.resolve(endpoint).then(records => {
            return srv.attempt(records, record => {
              log.info('Reconnecting push socket to "%s"', record.url)
              push.connect(record.url)
              return Promise.resolve(true)
            })
          })
        })
      log.info('Push socket reconnection successful')
        return true
      } catch (err) {
        log.error('Push socket reconnection failed:', err)
        return false
      }
    }

    async function retrySubConnection() {
      log.info('Attempting to reconnect sub socket for device:', options.serial)
      try {
        sub = zmqutil.socket('sub')
        await Promise.map(options.endpoints.sub, endpoint => {
          return srv.resolve(endpoint).then(records => {
            return srv.attempt(records, record => {
              log.info('Reconnecting sub socket to "%s"', record.url)
              sub.connect(record.url)
              return Promise.resolve(true)
            })
          })
        })
       
              
      if (deviceData.channel) {
      sub.subscribe(deviceData.channel)
      } else if (deviceData.provider && deviceData.provider.channel) {
      sub.subscribe(deviceData.provider.channel)
              }
      sub.subscribe(wireutil.global)
              
      log.info('Sub socket reconnection successful')
              return true
            } catch (err) {
              log.error('Sub socket reconnection failed:', err)
              return false
            }
          }

    async function restartZmq() {
      log.info('Attempting full ZMQ restart for device:', options.serial)
            try {
              
              push.close()
              sub.close()
        
              // Wait a bit before recreating connections
              await Promise.delay(1000)
        
              
              const pushSuccess = await retryPushConnection()
              const subSuccess = await retrySubConnection()
        
              if (pushSuccess && subSuccess) {
                log.info('Full ZMQ restart successful')
                return true
              } else {
                log.error('Full ZMQ restart failed')
                return false
              }
            } catch (err) {
              log.error('Error during ZMQ restart:', err)
              return false
            }
          }



    async function beat() {
     
     let channel = deviceData.channel? deviceData.channel: deviceData.provider.channel;
      let timeStamp = Date.parse(new Date())
      if(deviceData) {
        push.send([
          wireutil.global
          , wireutil.envelope(new wire.DeviceHeartbeatMessage(
            { serial: options.serial, channel: channel, timestamp: timeStamp.toString() }
          ))
        ])
        // console.log("#############  DeviceHeartbeatMessage sent ##################", options.serial)
      }

      setResponseObject[timeStamp] = setInterval(() => {
        counterFatal ++
        if(counterFatal > 20) {
          console.log("#############  DeviceHeartbeatMessage not received for "+options.serial)
          const pushSuccess =  retryPushConnection()
          if (pushSuccess) {
            
            const subSuccess =  retrySubConnection()
            
            if (subSuccess) {
              
              log.info('Successfully reconnected both push and sub sockets')
              counterFatal = 0
              return
            }
          }
          
          
          log.warn('Individual reconnections failed, attempting full ZMQ restart')
          const zmqSuccess =  restartZmq()
          
          if (zmqSuccess) {
            log.info('ZMQ restart successful')
            counterFatal = 0
          } else {
            log.fatal('All connection recovery attempts failed')
            lifecycle.fatal('Unable to restore ZMQ connections')
          }

          // const heartbeatMessage = new wire.DeviceHeartbeatMessage({
          //   serial:options.serial,
          //   channel:channel,
          //   timestamp:timeStamp.toString()
          // })
          // const pushSuccess = masterZeromqutil.sendPush(heartbeatMessage)
          // if (pushSuccess) {
          //   console.log("Push successful; now subscribing to channels.")
          //   masterZeromqutil.subscribeToChannels()
          // } else {
                
          //       console.error("Push failed.")
          //       //lifecycle.fatal("Master Connection broken");
          //     } 

          // const pingProcess = spawn('ping', ['-c', '1', options.publicIp])
 
          // pingProcess.stdout.on('data', (data) => {
          //   const output = data.toString()
          //   if (output.includes('Destination Host Unreachable') || output.trim() === '') {
          //     console.log('Ping failed or returned empty response.')
          //     lifecycle.fatal("Master connection broken due to failed ping.")
          //   }
          //   else{
          //     console.log('Ping was successful')
              
          //   }

          // })
 
          // pingProcess.stderr.on('data', (data) => {
          //   console.error(`Ping error: ${data.toString()}`)
          //   lifecycle.fatal("Master connection broken due to ping error.")
          // })
        }
       
      }, 5*60*1000);
    }

    router.on(wire.DeviceHeartbeatResponse, (channel, message) => {
      console.log("###################🚀 ~ DeviceHeartbeatResponse received from master ~ message:", message)
      if(message.serial == options.serial) {
        if(setResponseObject[message.timestamp]) {
          counterFatal = 0
          // console.log("clearInterval #################### Master connection broken, counterFatal:",counterFatal)
          clearInterval(setResponseObject[message.timeStamp])
        }
      }
    })

    let timer = setInterval(beat, options.heartbeatInterval)

    lifecycle.observe(() => clearInterval(timer))
  })
