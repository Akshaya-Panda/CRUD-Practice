const logger = require('../../../util/logger');
const Promise = require('bluebird');
const request = require('request');
const path = require('path')
const _ = require('lodash');
const url = require('url');
const util = require('util');
const syrup = require('@devicefarmer/stf-syrup');
const wire = require('../../../wire');
const wirerouter = require('../../../wire/router');
const wireutil = require('../../../wire/util');
const iosutil = require('./util/iosutil');
const { sleep } = require('../../../util/processutil');

const RETRY_LIMIT = 10;
const RETRY_DELAY = 3000; // 3 seconds
const log = logger.createLogger('wda:client');

async function retryOperation(operation, retries, delay) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await operation();
      return; // If operation succeeds, exit the function
    } catch (error) {
      if (attempt === retries) {
        throw error; // If final attempt fails, throw the error
      }
      console.error(`Attempt ${attempt} failed. Retrying in ${delay}ms...`, error);
      await sleep(delay);
    }
  }
}

module.exports = syrup.serial()
  .dependency(require('../support/push'))
  .dependency(require('../support/sub'))
  .dependency(require('./wda/WdaClient'))
  .dependency(require('../plugins/solo'))
  .define((options, push, sub, wdaClient, solo) => {
    const Wda = {};
    Wda.startIniated = false;
    Wda.stopWda = false;
    Wda.startCompleted = false;

  if(options.stopWda) {
    log.info("Skipping the wda plugin because wda has been stopped for automation")
    return
  } else {
    Wda.connect = async () => {
      try {
        await sleep(1000);

        // Retry mechanism for starting WDA session
        await retryOperation(() => wdaClient.startSession(), RETRY_LIMIT, RETRY_DELAY);

        await sleep(2000);

        sub.on('message', wirerouter()
          .on(wire.KeyPressMessage, (channel, message) => {
            retryOperation(() => iosutil.pressButton.call(wdaClient, message.key), RETRY_LIMIT, RETRY_DELAY)
              .catch(err => log.error('Failed to press button', err));
          })
          .on(wire.StoreOpenMessage, (channel, message) => {
            retryOperation(() => wdaClient.appActivate('com.apple.AppStore'), RETRY_LIMIT, RETRY_DELAY)
              .catch(err => log.error('Failed to open App Store', err));
          })
          .on(wire.DashboardOpenMessage, (channel, message) => {
            retryOperation(() => wdaClient.appActivate('com.apple.Preferences'), RETRY_LIMIT, RETRY_DELAY)
              .catch(err => log.error('Failed to open Preferences', err));
          })
          .on(wire.PhysicalIdentifyMessage, (channel, message) => {
            retryOperation(() => wdaClient.appActivate('com.apple.findmy'), RETRY_LIMIT, RETRY_DELAY)
              .catch(err => log.error('Failed to open Find My', err));
          })
          .on(wire.TouchDownIosMessage, (channel, message) => {
            retryOperation(() => wdaClient.tap(message), RETRY_LIMIT, RETRY_DELAY)
              .catch(err => log.error('Failed to tap', err));
          })
          .on(wire.TapDeviceTreeElement, (channel, message) => {
            retryOperation(() => wdaClient.tapDeviceTreeElement(message), RETRY_LIMIT, RETRY_DELAY)
              .catch(err => log.error('Failed to tap device tree element', err));
          })
          .on(wire.TouchMoveIosMessage, (channel, message) => {
            retryOperation(() => wdaClient.swipe(message), RETRY_LIMIT, RETRY_DELAY)
              .catch(err => log.error('Failed to swipe', err));
          })
          .on(wire.TypeMessage, (channel, message) => {
            log.verbose("wire.TypeMessage: ", message);
            retryOperation(() => wdaClient.typeKey({ value: [iosutil.asciiparser(message.text)] }), RETRY_LIMIT, RETRY_DELAY)
              .catch(err => log.error('Failed to type key', err));
          })
          .on(wire.KeyDownMessage, (channel, message) => {
            log.verbose("wire.TypeMessage: ", message);
            retryOperation(() => wdaClient.typeKey({ value: [iosutil.asciiparser(message.key)] }), RETRY_LIMIT, RETRY_DELAY)
              .catch(err => log.error('Failed to type key down', err));
          })
          .on(wire.BrowserOpenMessage, (channel, message) => {
            retryOperation(() => wdaClient.openUrl(message), RETRY_LIMIT, RETRY_DELAY)
              .catch(err => log.error('Failed to open URL', err));
          })
          .on(wire.RotateMessage, (channel, message) => {
            const rotation = iosutil.degreesToOrientation(message.rotation);
            retryOperation(() => wdaClient.rotation({ orientation: rotation })
              .then(() => {
                push.send([
                  wireutil.global,
                  wireutil.envelope(new wire.RotationEvent(
                    options.serial,
                    message.rotation
                  ))
                ]);
              }), RETRY_LIMIT, RETRY_DELAY)
              .catch(err => log.error('Failed to rotate device to: ', rotation, err));
          })
          .on(wire.TouchUpMessage, (channel, message) => {
            retryOperation(() => wdaClient.touchUp(), RETRY_LIMIT, RETRY_DELAY)
              .catch(err => log.error('Failed to touch up', err));
          })
          .on(wire.wdaApiRequest, async (channel, message) => {
            let reply = wireutil.reply(options.serial);
            retryOperation(async () => {
              const result = await wdaClient.callWDApi(message.method, message.endpoint, JSON.parse(message.payload));
              push.send([
                channel,
                reply.okay('success', result)
              ]);
            }, RETRY_LIMIT, RETRY_DELAY)
            .catch(error => {
              log.error("WDA API call failed", error);
              push.send([
                channel,
                reply.fail('WDA API call failed', error)
              ]);
            });
          })
          .on(wire.stopWda, async (channel, message) => {
            log.info("Stop WDA request has been received...")
            let reply = wireutil.reply(options.serial);
            let jsonFile = options.serial+'.json'
            let jsonFilePath = path.join('..', '..', '..', '..', 'metaData', jsonFile);
            let appiumData = require(jsonFilePath)
            let responseData = {}
            if(appiumData) {
              responseData.appium_url = appiumData?.automationDetails?.appium_url
              responseData.capabilities = appiumData?.capabilities
            }
            if(Wda.startIniated && !(Wda.startCompleted)) {
              responseData.message =  "Gesture control is already stopped on the device"
              await iosutil.killWdaScriptProcess()
              push.send([
                channel,
                reply.okay('success', responseData)
              ]);
            } else {
              const wdaStatus = await wdaClient.wdaStatus()
              if(wdaStatus) {
                await wdaClient.wdaShutdown()
                .then(result => {
                  Wda.stopWda = true
                  options.stopWda = true
                  Wda.startCompleted = false
                  responseData.message = "Gesture control is stopped on the device"
                  push.send([
                    channel,
                    reply.okay('success', responseData)
                  ]);
                  log.info("WDA has been stopped because automation has been started on the device")
                }).catch(error => {
                  log.error("Stop WDA operation is failed", error);
                  push.send([
                    channel,
                    reply.fail('Stop WDA operation is failed', error)
                  ]);
                });
              }
            }
          })
          .on(wire.startWda, async (channel, message) => {
            log.info("Start WDA request has been received...")
            let reply = wireutil.reply(options.serial);
            Wda.startCompleted = false
            Wda.startIniated = true;
            const runWdaScriptRes = await iosutil.runWdaScript(options.host, options.appiumPort, options.serial, options.wdaPort)
            if(runWdaScriptRes) {
              Wda.stopWda = false
              options.stopWda = false
              Wda.startCompleted = true
              Wda.startIniated = false;
              await wdaClient.startSession();
              log.info("WDA has been resumed because automation has been stopped on the device")
              Wda.startCompleted = false
              push.send([
                channel,
                reply.okay('success', 'okay')
              ]);
            } else {
              log.error(`Unable to start WDA ${runWdaScriptRes}`)
              push.send([
                channel,
                reply.fail('Start WDA operation is failed', runWdaScriptRes)
              ]);
              lifecycle.fatal()
            }

          })  //DeviceAutomationReadyMessage
          // .on(wire.DeviceAutomationReadyMessage, (channel, message) => {
          //   console.log("🚀 ~ DeviceAutomationReadyMessage .on ~ message:", message, "options.endpoints",options.endpoints)
          //   push.send([
          //     wireutil.global
          //     , wireutil.envelope(new wire.DeviceAutomationReadyMessage(
          //       options.serial
          //       , channel
          //     ))
          //   ])
          // })
          .on(wire.ScreenCaptureMessage, async (channel, message) => {
            retryOperation(async () => {
              const response = await wdaClient.screenshot();
              let reply = wireutil.reply(options.serial);
              let args = {
                url: url.resolve(options.storageUrl, util.format('s/upload/%s', 'image'))
              };

              const imageBuffer = Buffer.from(response.value, 'base64');

              let req = request.post(args, (err, res, body) => {
                try {
                  let result = JSON.parse(body);
                  push.send([
                    channel,
                    reply.okay('success', result.resources.file)
                  ]);
                } catch (err) {
                  log.error('Invalid JSON in response', err.stack, body);
                }
              });

              req.form().append('file', imageBuffer, {
                filename: util.format('%s.png', options.serial),
                contentType: 'image/png'
              });
            }, RETRY_LIMIT, RETRY_DELAY)
            .catch(err => log.error('Failed to get screenshot', err));
          })
          .handler());

        return Promise.resolve();
      } catch (err) {
        log.error('Failed to connect Wda', err);
        throw err;
      }
    };

    return Wda;
  }
  });

