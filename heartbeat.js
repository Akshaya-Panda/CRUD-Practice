const syrup = require('@devicefarmer/stf-syrup')
const lifecycle = require('../../../util/lifecycle')
const wire = require('../../../wire')
const wireutil = require('../../../wire/util')
const wirerouter = require('../../../wire/router');
const dbapi = require('../../../db/api')
const { exec, spawn } = require('child_process')

module.exports = syrup.serial()
  .dependency(require('../support/push'))
  .dependency(require('../support/sub'))
  .dependency(require('../support/router'))
  .define(async (options, push, sub ,router) => {
    let counterFatal = 0;
    var setResponseObject = {}
    const deviceData = await dbapi.getDeviceById(options.serial)
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
          console.log("These are the values coming in the options",options)
          console.log("#############  DeviceHeartbeatMessage not received for "+options.serial)
          const pingProcess = spawn('ping', ['-c', '1', options.publicIp])
 
          pingProcess.stdout.on('data', (data) => {
            const output = data.toString()
            if (output.includes('Destination Host Unreachable') || output.trim() === '') {
              console.log('Ping failed or returned empty response.')
              lifecycle.fatal("Master connection broken due to failed ping.")
            }
            else{
              console.log('Ping was successful')
              
            }

          })
 
          pingProcess.stderr.on('data', (data) => {
            console.error(`Ping error: ${data.toString()}`)
            lifecycle.fatal("Master connection broken due to ping error.")
          })
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
