const Promise = require('bluebird')
const syrup = require('@devicefarmer/stf-syrup')
const fs = require('fs')
const http = require('http');
const urljoin = require('url-join')
const path = require('path')
const os = require('os')
const uuid = require('uuid')
const _ = require('lodash')
const request = require('request')
const isWsl = require('is-wsl')

const wire = require('../../../wire')
const wireutil = require('../../../wire/util')
const dbapi = require('../../../db/api')
const logger = require('../../../util/logger')
const adbutil = require('../../../util/adbutil')
const fileutil = require('../../../util/fileutil')
const lifecycle = require('../../../util/lifecycle')
const promiseutil = require('../../../util/promiseutil')
const processutil = require('../../../util/processutil')
const mongo = require('../../../util/mongo')
const { serializeTestAssistSession } = require('../../api/controllers/devices')

const isWindows = isWsl || os.platform() === 'win32'

module.exports = syrup.serial()
  .dependency(require('../support/router'))
  .dependency(require('../support/push'))
  .dependency(require('./group'))
  .dependency(require('./logcat'))
  .dependency(require('./infologs'))
  .dependency(require('./screen/capture'))
  .dependency(require('./screen/record'))
  .dependency(require('./qxdm'))
  .define(async function (options, router, push, group, logcat, infologs, capture, recordPlugin, qxdmPlugin) {
    const log = logger.createLogger('device:plugins:test-assist')

    const storageFolder = `${os.homedir()}/tmdc/storage`

    const remoteLogcatDirName = "logcat"
    const remoteBugreportsDirName = "bugreports"
    const remoteScreenshotsDirName = "screenshots"
    const remoteQXDMDirName = "qxdm"
    const remoteVideoDirName = "screencapture"
    const appUrl = options.appUrl
    const webhookURL = urljoin(options.appUrl, "/webhook-manager/")

    let mongodb
    const mongoURL = options.testAssistMongoUrl
    const mongoDB = options.testAssistDbName || "test_assist"
    const mongoCollection = options.testAssistCollectionName || "test_assist_entries_default"

    const fileServerUrl = options.fileServerUrl
    const fileServerPort = options.fileServerPort
    const fileServerUsername = options.fileServerUsername
    const fileServerPassword = options.fileServerPassword
    const fileServerBasedir = options.fileServerBasedir

    const defaultSessionTimeoutDuration = options.testAssistTimeout || 10 * 60 * 1000 // 10 minutes
    const defaultSessionConfig = {
      infologs: {},
      logcat: {},
      qxdm: {
        maskFile: null
      },
      video: {
        framerate: 15,
      },
      bugreport: {},
      sessionDuration: defaultSessionTimeoutDuration
    }

    function resetSession(session) {
      return {
        executionID: null,
        testCaseID: null,
        config: _.cloneDeep(defaultSessionConfig),
        stopConfig: null,
        isStopping: false,
        status: null,
        startTimestamp: null,
        stopTimestamp: null,
        stoppedBy: null,
        user: null,
        deviceChannel: null,
        handlers: {
          logcat: null,
          deviceInfo: null,
        },
        intervals: {
          timeout: null,
          toLocalDB: null,
          parseLogcat: null,
          getServerLocationInterval: null,
          getNetworkTypeInterval: null,
        },
        count: 0,
        entriesQueue: [],
        logcatEntriesQueue: [],
        deviceLocations: [],
        serverLocations: [],
        logcatPathname: null,
        logcatFilename: null,
        logcatStatus: null,
        percentage: 0,
        bugreports: {
          optinBugreport: false,
          status: session && session.bugreports && session.bugreports == 'generating' ? "generating" : "ready",
          list: [],
        },
        screenshots: [],
        video: null,
        qxdm: null,
        phoneData: null,
        operator: null,
        callbackURL: null,
      }
    }
    let session = resetSession(null)

    function mapMetadataToEntry(entry) {
      return ({
        metadata: {
          executionID: session.executionID,
          testCaseID: session.testCaseID,
          messageID: session.count,
        },
        entry
      })
    }
    function entryHandler(cb) {
      return (entry) => {
        session.count = session.count + 1
        cb(mapMetadataToEntry(entry))
      }
    }

    function appendLogcatEntriesToFile(rawEntries) {
      const logcatPathname = session.logcatPathname, logcatFilename = session.logcatFilename
      if (rawEntries && rawEntries.length > 0) {
        const filePath = path.join(logcatPathname, logcatFilename)
        const text = rawEntries.reduce((all, rawEntry) => all + "\n" + rawEntry, "")
        fs.writeFileSync(filePath, text, { encoding: 'utf8', flag: 'a+' })
      }
    }

    function parseAndSaveToFileLogcatEntries() {
      if (!session.logcatEntriesQueue || session.logcatEntriesQueue.length == 0) {
        return Promise.resolve()
      }

      log.info(`Parsing ${session.logcatEntriesQueue.length} logcat entries`)
      const rawEntries = []
      while (session.logcatEntriesQueue.length > 0) {
        rawEntries.push(session.logcatEntriesQueue.shift())
      }

      if (!!session.config.logcat) {
        // write logcat entries to file
        log.info("Appending logcat entries to file...")
        appendLogcatEntriesToFile(rawEntries)
      }

      return new Promise(function (resolve, reject) {
        const url = `${appUrl}/logcat_parser/parse/${session.executionID}`
        request.post(url, {
          json: true,
          rejectUnauthorized: false,
          strictSSL: false,
          body: rawEntries,
          timeout: 500
        }, function (err, res) {
          if (err) {
            log.error(`Could not parse or reach parser process: ${err.message}`)
            return resolve(false)
          }
          if (!res.body || !res.body.results) {
            log.error(`Could not parse or reach parser process`)
            return resolve(false)
          }
          if (!res.body.results.length) {
            log.error(`Parsed data returned is empty`)
            return resolve(false)
          }

          const data = res.body.results
          log.info(`Received ${data.length} parsed entries`)
          data.map(entryHandler((entry) => {
            delete entry.entry["Filename"]
            session.entriesQueue.push({
              metadata: {
                type: "logcat",
                ...entry.metadata,
                timestamp: entry.entry.Timestamp || new Date(),
              },
              entry: entry.entry,
            })
          }))

          return resolve(data.length)
        })
      })
    }

    function offloadEntriesToLocalDB() {
      if (!session.entriesQueue || session.entriesQueue.length == 0) {
        return Promise.resolve()
      }

      log.info(`Storing ${session.entriesQueue.length} entries to local db`)
      const entries = []
      while (session.entriesQueue.length > 0) {
        entries.push(session.entriesQueue.shift())
      }
      return dbapi.saveTestAssistEntries(entries)
    }

    async function uploadLogcatFile(session, logcatFilepath, logcatFilename, remoteLogcatFilename, remoteDestinationDir) {
      try {
        const cmd = `sshpass -p ${fileServerPassword} scp -P ${fileServerPort} "${path.join(logcatFilepath, logcatFilename)}" ${fileServerUsername}@${fileServerUrl}:${path.join(remoteDestinationDir, remoteLogcatFilename)}`
        console.log("🚀 ~ uploadLogcatFile ~ cmd:", cmd)
        const result = await processutil.execute(cmd)
        return ({ name: remoteLogcatFilename, path: remoteDestinationDir })
      } catch (err) {
        log.error(`Could not upload ${remoteLogcatFilename} of exID ${session.executionID}: ${err.message}`)
        return false
      }
    }


    async function uploadBugreportFile(session, bugreport, remoteDestinationDir) {
      try {
        let bugreportPath = bugreport.path
        if (!fs.existsSync(bugreportPath)) {
          bugreportPath = bugreportPath.replace("_complete", "")
          bugreport.name = bugreport.name.replace("_complete", "")
        }
        const cmd = `sshpass -p ${fileServerPassword} scp -P ${fileServerPort} "${bugreportPath}" ${fileServerUsername}@${fileServerUrl}:${path.join(remoteDestinationDir, bugreport.remote)}`
        console.log("🚀 ~ uploadBugreportFile ~ cmd:", cmd)
        const result = await processutil.execute(cmd)
        return ({ name: bugreport.remote, path: remoteDestinationDir })
      } catch (err) {
        log.error(`Could not upload ${bugreport.remote} of exID ${session.executionID}: ${err.message}`)
        bugreport.status = 'failed'
        return false
      }
    }

    async function uploadScreenshot(session, screenshot, remoteDestinationDir) {
      try {
        const remote = path.join(remoteDestinationDir, screenshot.remote)
        const cmd = `sshpass -p ${fileServerPassword} scp -P ${fileServerPort} "${path.join(screenshot.path, screenshot.name)}" ${fileServerUsername}@${fileServerUrl}:${remote}`
        console.log("🚀 ~ uploadScreenshot ~ cmd:", cmd)
        const result = await processutil.execute(cmd)
        return ({ name: screenshot.remote, path: remoteDestinationDir })
      } catch (err) {
        log.error(`Could not upload ${screenshot.remote} of exID ${session.executionID}: ${err.message}`)
        screenshot.status = 'failed'
        return false
      }
    }

    async function uploadQXDMLog(session, qxdm, remoteDestinationDir) {
      try {
        const logFilePathArr = qxdm.logFilePath.split("\\")
        const driveLetter = logFilePathArr[0][0].toLowerCase()
        const logPathRelativeToWSL = path.resolve(`/mnt/${driveLetter}/`, logFilePathArr.slice(1).join("/"))
        const cmd = `sshpass -p ${fileServerPassword} scp -P ${fileServerPort} "${logPathRelativeToWSL}" ${fileServerUsername}@${fileServerUrl}:${path.join(remoteDestinationDir, qxdm.remote)}`
        console.log("🚀 ~ uploadQXDMLog ~ cmd:", cmd)
        const result = await processutil.execute(cmd)
        return ({ name: qxdm.remote, path: remoteDestinationDir })
      } catch (err) {
        log.error(`Could not upload ${qxdm.remote} of exID ${session.executionID}: ${err.message}`)
        return false
      }
    }

    async function uploadVideo(session, video, remoteDestinationDir) {
      try {
        const cmd = `sshpass -p ${fileServerPassword} scp -P ${fileServerPort} "${path.join(video.videoFilePath, video.videoFileName)}" ${fileServerUsername}@${fileServerUrl}:${path.join(remoteDestinationDir, video.remote)}`
        const result = await processutil.execute(cmd)
        console.log("🚀 ~ uploadVideo ~ cmd:", cmd)
        return ({ name: video.remote, path: remoteDestinationDir })
      } catch (err) {
        log.error(`Could not upload ${video.remote} of exID ${session.executionID}: ${err.message}`)
        return false
      }
    }

    async function tryMkDirRemote(remoteDestinationDir) {
      const cmd = `sshpass -p ${fileServerPassword} ssh ${fileServerUsername}@${fileServerUrl} -p ${fileServerPort} "mkdir -p '${remoteDestinationDir}'"`
      try {
        const result = await processutil.execute(cmd)
        return result
      } catch (err) {
        log.error(`Could not create directory on remote file server: ${err.message}`)
        return false
      }
    }

    async function onFinishSessionParseAndUploadCallback(sess) {
      if (!sess.callbackURL) {
        return true
      }

      try {
        return new Promise(resolve => {
          var data = {
            'type': "session",
            ...serializeTestAssistSession(sess)
          }
          const postData = {
            url: sess.callbackURL,
            data: data
          }

          log.info(`Notifying webhook service @ ${webhookURL}`)
          request.post(webhookURL, {
            json: true,
            rejectUnauthorized: false,
            strictSSL: false,
            body: postData
          }, function (err, res) {
            if (err) {
              log.error(`Could not notify webhook: ${err.message}`)
              return resolve(false)
            }

            if(res.statusCode != 200) {
              log.error(`Could not notify webhook: ${res.statusCode}, ${res.statusMessage}`)
              return resolve(false)
            }

            log.info(`Notified webhook: ${res.statusCode}, ${res.statusMessage}, ${res.body ? JSON.stringify(res.body) : ""}`)
            resolve(true)
          });
        })
      } catch (err) {
        log.error(`Could not notify webhook: ${err.message}`)
        return false
      }
    }

    async function getNetworkType() {
      const result = await dbapi.getDeviceConnectivity(options.serial)
      if (result) {
        const network = result.network
        const operator = result.operator
        session.entriesQueue.push({
          metadata: {
            executionID: session.executionID,
            testCaseID: session.testCaseID,
            messageID: session.count + 1,
            timestamp: new Date(),
            type: 'network',
          },
          entry: {
            message: {
              "network type": network.type,
              "Carrier Name": operator
            }
          }
        })
        session.count++
      }
    }

    async function getServerLocation() {
      push.send([
        wireutil.global
        , wireutil.envelope(new wire.GetServerLocationMessage(
          options.serial
        ))
      ])
    }

    async function informGpsUtilOfStop() {
      push.send([
        wireutil.global
        , wireutil.envelope(new wire.StopGpsUtilMessage(
          options.serial
        ))
      ])
      return true
    }

    function isServerLocation(metadata) {
      return metadata.type == "server-location"
    }

    function isLocation(entry, metadata) {
      return metadata.type == "device-info" && entry.type == "locationChange"
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////

    const plugin = Object.create(null)

    plugin.init = async function () {
      try {
        const executions = await dbapi.markStoppedTestAssistExecutions(options.serial)
        for (const execution of executions.reverse()) {
          if (execution.RESTART === true) {
            const unfinishedSession = execution.session
            const deviceChannel = unfinishedSession.deviceChannel
            log.info(`Unfinished session detected: ${unfinishedSession.executionID}, restarting...`)
            plugin.restart(unfinishedSession)
            break
          }
        }
      } catch (err) {
        log.error(`Could not mark prematurely stopped session executions: ${err.message}`)
      }
      mongodb = await mongo(mongoURL, mongoDB)
      return plugin
    }

     plugin.start = async function (testCaseID, serviceCommandIntervals = [], config = null, startedAutomation) {
      session = resetSession()
      const currentGroup = await group.get()
      session.executionID = uuid.v4().replace(/-/g, "")
      session.testCaseID = testCaseID || ""
      session.serial = options.serial
      session.status = "started"
      session.startedAutomation = startedAutomation || false
      session.startTimestamp = new Date()
      session.serviceCommandIntervals = serviceCommandIntervals

      const user = await dbapi.loadUser(currentGroup.email)
      session.user = {
        name: user.name,
        email: user.email,
        privilege: user.privilege,
        group: user.group,
      }
      if (config) {
        session.config = config
      }

      const deviceData = await dbapi.getDeviceById(options.serial)
      session.phoneData = deviceData.phone
      session.operator = deviceData.operator
      session.deviceChannel = deviceData.channel

      log.info(`Starting new session: ${session.executionID}`)
      const _startRes = await _start(currentGroup)

      log.info(`Session will time out after ${(session.config.sessionDuration || defaultSessionTimeoutDuration) / 1000} seconds`)
      session.intervals.timeout = setTimeout(() => plugin.stop(null, null, "timeout"), session.config.sessionDuration || defaultSessionTimeoutDuration)
      return _startRes
    }

    plugin.restart = async function (prevSession) {
      session = resetSession()
      session.executionID = prevSession.executionID
      session.testCaseID = prevSession.testCaseID
      session.serial = prevSession.serial
      session.status = prevSession.status
      session.startTimestamp = prevSession.startTimestamp
      session.serviceCommandIntervals = prevSession.serviceCommandIntervals
      if (prevSession.bugreports) {
        session.bugreports = prevSession.bugreports
      }
      if (prevSession.logcatPathname) {
        session.logcatPathname = prevSession.logcatPathname
      }
      if (prevSession.logcatFilename) {
        session.logcatFilename = prevSession.logcatFilename
      }
      if (prevSession.logcatStatus) {
        session.logcatStatus = prevSession.logcatStatus
      }
      if (prevSession.screenshots) {
        session.screenshots = prevSession.screenshots
      }

      session.phoneData = prevSession.phone
      session.operator = prevSession.operator

      const prevUser = prevSession.user
      session.user = prevUser
      const prevGroup = await group.join({
        email: prevUser.email,
        name: prevUser.name,
        group: prevUser.group,
      }, null, null)

      return _start(prevGroup, true)
    }

    const _start = async function (currentGroup, restart = false) {
      const logcatHandler = (entry) => {
        // handle logcat messages
        session.logcatEntriesQueue.push(entry.raw)
      }
      session.handlers.logcat = logcatHandler
      if(session.config.logcat) {
        logcat.emitter().on(wire.MessageType.DeviceLogcatEntryMessage, logcatHandler)
      }

      const deviceInfoHandler = entryHandler((entry) => {
        // handle device info messages
        const entryBody = entry.entry
        const entryMessage = entryBody.message
        const entryMetadata = entry.metadata

        if (entryBody.type == "cellNetworkChange" || entryBody.type == "getTelephonyData") {
          if (entryMessage && entryMessage.properties && !!entryMessage.properties.length) {
            const flatObj = entryMessage.properties.reduce((acc, curr) => {
              if (curr["key"] && !!curr["string_value"]) {
                acc[curr["key"]] = curr["string_value"]
              }
              return acc
            }, {})
            delete entryMessage.properties
            entryBody.message = {
              ...entryMessage,
              ...flatObj,
            }
          } else {
            // message props are empty, discard
            return
          }
        }

        if(entryBody.type == "cpuChange") {
          const freqs = {}
          for (const freq of entryMessage.core_frequency) {
            freqs[`cpuCore${freq.index}Current`] = parseInt(freq.current["low"], 10)
            freqs[`cpuCore${freq.index}Max`] = parseInt(freq.max["low"], 10)
          }
          entryBody.message = freqs
        }

        if(entryBody.type == "getResources") {
          entryBody.message = {
            ramAvailable: parseInt(entryMessage.availableMemory, 10),
            ramMax: parseInt(entryMessage.totalMemory, 10),
            romAvailable: parseInt(entryMessage.availableStorage, 10),
            romMax: parseInt(entryMessage.totalStorage, 10),
          }
        }

        if (isWindows && session.config.qxdm) {
          if (isLocation(entryBody, { type: "device-info" })) {
            session.deviceLocations.push({
              longitude: entryMessage.longitude,
              latitude: entryMessage.latitude,
              timestamp: entryBody.timestamp,
            })
          }
        }

        session.entriesQueue.push({
          metadata: {
            type: "device-info",
            ...entryMetadata,
            timestamp: entryBody.timestamp || new Date(),
          },
          entry: entryBody,
        })
      })

      session.handlers.deviceInfo = deviceInfoHandler
      if(session.config.infologs) {
        infologs.emitter().on(wire.MessageType.DeviceInfoLogsEntryMessage, deviceInfoHandler)
      }

      const [execID_api, iterationID] = session.testCaseID.split("_$#$_")

      if (!restart && session.config.bugreport) {
        // start and discard previous bugreport, unless opted in by user
        session.bugreports.status = 'discarding'
        new Promise(resolve => adbutil.generateBugReportFile(options.serial, currentGroup.email)
          .then((brResult) => {
            return new Promise((res) => {
              const filename = brResult.filename
              const path = brResult.path
              const now = new Date()
              const executionID = session.executionID
              const interval = setInterval(async () => {
                adbutil.checkBugReportFileExist(filename, currentGroup.email)
                  .then(async result => {
                    clearInterval(interval)
                    if (session.bugreports.optinBugreport) {
                      const seq = session.bugreports.list.length + 1
                      const newBugReport = {
                        name: filename,
                        path: path,
                        timestamp: now,
                        remote: `${iterationID}_${options.serial}_bugreport_${seq}.zip`
                      }
                      session.bugreports.list.push(newBugReport)
                      await dbapi.insertTestAssistBugReport(executionID, newBugReport)
                      res()
                    } else {
                      fs.unlink(result.path, () => {
                        res()
                      })
                    }
                  })
                  .catch((err) => {
                    if (err.exist == false) {
                      // still not generated, you can ignore
                    } else {
                      res()
                    }
                  })
              }, 10000)
            })
              .then(resolve)
          })
          .catch((err) => {
            log.error(`Error generating and discarding initial bugreport file (you can ignore this error): ${err.message}`)
            resolve()
          }))
          .timeout(6 * 60 * 1000)
          .finally(() => {
            session.bugreports.status = "ready"
            push.send([
              currentGroup.group
              , wireutil.envelope(new wire.TestAssistBugReportStatusMessage(
                options.serial,
                session.bugreports.status,
                session.bugreports.list.map(br => br.name),
              ))
            ])
          })
      const errors = []
      // start all plugins
      return Promise.all([
        //flush logcat
        session.config.logcat ? new Promise(rslv => {
          processutil.execute(`adb -s ${options.serial} logcat --clear`).then(rslv).catch((err) => {
            log.info("Could not clear logcat: " + err.message)
            return rslv(true)
          })
          setTimeout(() => {
            log.info("Clearing logcat timed out after 5 seconds ")
            rslv(true)
          }, 5000)
        })
          .then(() => logcat.start([]))
          .then(() => {
            log.info("Started logcat from test-assist")
          }).catch(err => ({ error: err.message })) : Promise.resolve(true),
        session.config.infologs ? infologs.startWithEmitter([], session.serviceCommandIntervals).then(() => {
          log.info("Started device info logs from test-assist")
        }).catch(err => ({ error: err.message })) : Promise.resolve(true),
        session.config.video ? new Promise((rslv) =>
          recordPlugin.start(true, session.executionID, session.user.email, session.config.video.framerate, session.config.sessionDuration || defaultSessionTimeoutDuration)
            .then(rslv)
            .catch(err => rslv({ error: err.message }))
        ) : Promise.resolve(true),
        isWindows && session.config.qxdm ? new Promise(async (rslv) => {
          qxdmPlugin.verify().then((capability) => {
            if (!capability) return rslv({ error: new Error("Device QXDM port/capability not enabled") })
            return qxdmPlugin.start({ email: session.user.email, maskFile: session.config.qxdm.maskFile || "default.dmc", packets: session.config.qxdm.packets || [], execID: execID_api, iterID: iterationID, timeout: session.config.sessionDuration || defaultSessionTimeoutDuration })
              .then(rslv)
              .catch(err => rslv({ error: err.message }))
          }).catch(err => rslv({ error: err.message }))
        }) : Promise.resolve(true),
      ]).then(async (startPluginsResult) => {
        if (session.config.video) {
          try {
            const videoResult = startPluginsResult[2]
            if (videoResult.error) {
              const err = "Failed to start video recording: " + videoResult.error
              session.video = { error: err }
              errors.push(err)
              log.error(err)
            } else {
              const { recordingID, framerate } = videoResult
              session.video = { recordingID, framerate, remote: `${iterationID}_${options.serial}_video.mp4` }
            }
          } catch (err) {
            log.error(`Error starting video recording from test-assist: ${err.message}`)
          }
        }

        if (isWindows && session.config.qxdm) {
          try {
            const qxdmResult = startPluginsResult[3]
            if (qxdmResult.error) {
              const err = "Failed to start qxdm: " + qxdmResult.error
              session.qxdm = { error: err }
              errors.push(err)
              log.error(err)
            } else {
              const { sessionId, logId, startLogTimestamp, timeoutOn, services } = qxdmResult
              session.qxdm = { sessionId, logId, startLogTimestamp, timeoutOn, services, remote: `${iterationID}_${options.serial}_qxdm.hdf` }
            }
          } catch (err) {
            log.error(`Error starting qxdm from test-assist: ${err.message}`)
          }
        }

        const datestamp = session.startTimestamp.toISOString().slice(0, 10)
        const logcatPathname = path.join(storageFolder, datestamp, session.user.name, 'logcat')
        // create logcat path
        fileutil.createDirectoryRecursive(logcatPathname)

        const timestamp = session.startTimestamp.toISOString().replace("T", "_").replace(/:/g, "").split(".")[0]
        const logcatFilename = `${options.serial}_${timestamp}.txt`

        session.logcatPathname = logcatPathname
        session.logcatFilename = logcatFilename
        session.remoteLogcatFilename = `${iterationID}_${options.serial}_logcat.txt`

        session.intervals.parseLogcat = setInterval(
          parseAndSaveToFileLogcatEntries,
          10 * 1000, // every 10 seconds
        )
        session.intervals.toLocalDB = setInterval(
          offloadEntriesToLocalDB,
          30 * 1000 // every 30 seconds
        )
        session.intervals.getServerLocationInterval = setInterval(
          getServerLocation,
          1 * 1000 // every second
        )
        session.intervals.getNetworkTypeInterval = setInterval(
          getNetworkType,
          1 * 1000 // every second
        )

        const saveStartDb = {
          executionID: session.executionID,
          testCaseID: session.testCaseID,
          config: session.config,
          serial: options.serial,
          status: session.status,
          startTimestamp: session.startTimestamp,
          deviceChannel: session.deviceChannel,
          user: session.user,
          serviceCommandIntervals: session.serviceCommandIntervals,
          logcatPathname: session.logcatPathname,
          logcatFilename: session.logcatFilename,
          remoteLogcatFilename: session.remoteLogcatFilename,
          bugreports: session.bugreports,
          screenshots: session.screenshots,
          percentage: session.percentage,
          callbackURL: session.callbackURL,
        }
        if (session.phoneData) {
          saveStartDb.phoneData = session.phoneData
        }
        if (session.operator) {
          saveStartDb.operator = session.operator
        }
        if (session.video) {
          saveStartDb.video = session.video
        }
        if (session.qxdm) {
          saveStartDb.qxdm = session.qxdm
        }
        return dbapi.saveStartTestAssistExecution(saveStartDb)
      }).then(() => {
        return {
          executionID: session.executionID,
          testCaseID: session.testCaseID,
          serial: options.serial,
          status: session.status,
          startTimestamp: session.startTimestamp,
          user: session.user,
          logcatPathname: session.logcatPathname,
          logcatFilename: session.logcatFilename,
          bugreports: session.bugreports,
          screenshots: session.screenshots,
          percentage: session.percentage,
          phoneData: session.phoneData,
          operator: session.operator,
          qxdm: session.qxdm,
          video: session.video,
          errors: errors,
        }
      })
    }

    plugin.stop = async function (previousGroup, config = null, stoppedBy) {
      try {
        session.status = "stopped"
        session.stoppedBy = stoppedBy
        session.isStopping = true
        session.stopTimestamp = new Date()
        if (config) {
          session.stopConfig = config
          session.callbackURL = config.callbackURL
        }

        if (stoppedBy !== "timeout") {
          clearTimeout(session.intervals.timeout)
        }

        const prevSess = _.clone(session)

        if (session.config.bugreport && session.bugreports.status !== "generating") {
          ; (async () => {
            let currentGroup
            try {
              if (previousGroup) {
                currentGroup = previousGroup
              } else {
                currentGroup = await group.get()
              }
            } catch (err) {
              log.info(`Could not find group ${err.message}`)
            }
            plugin.generateBugReport(prevSess, currentGroup).then(function () {
              if (currentGroup) {
                push.send([
                  currentGroup.group
                  , wireutil.envelope(new wire.TestAssistBugReportStatusMessage(
                    options.serial,
                    "generating",
                    session.bugreports.list.map(br => br.name),
                  ))
                ])
              }
            })
          })();
        }

        // parse any remaining logcat entries in the queue
        await parseAndSaveToFileLogcatEntries()
        // write any remaining entries in queue to localdb before ending
        await offloadEntriesToLocalDB()

        logcat.emitter().removeListener(wire.MessageType.DeviceLogcatEntryMessage, session.handlers.logcat)
        infologs.emitter().removeListener(wire.MessageType.DeviceInfoLogsEntryMessage, session.handlers.deviceInfo)
        Object.entries(session.intervals).map(interval => interval[1]).forEach(interval => clearInterval(interval))

        // stop all plugins
        return Promise.all([
          informGpsUtilOfStop().catch(err => ({ error: err.message })),
          session.config.logcat ? logcat.stop().then(() => {
            log.info("Stopped logcat from test-assist")
          }).catch(err => ({ error: err.message })) : Promise.resolve(true),
          session.config.infologs ? infologs.stop().then(() => {
            log.info("Stopped device info logs from test-assist")
          }).catch(err => ({ error: err.message })) : Promise.resolve(true),
          prevSess.config.video ? new Promise(rslv => {
            recordPlugin.stop(prevSess.executionID).progressed((videoResult) => {
              return rslv(videoResult)
            }).then((videoResult) => {
              return rslv(videoResult)
            }).catch(err => rslv({ error: err.message }))
          }) : Promise.resolve(true),
          isWindows && prevSess.config.qxdm && !session.qxdm.error ? qxdmPlugin.stop({
            dbName: prevSess.stopConfig ? prevSess.stopConfig.database : null,
            locations: {
              deviceLocations: prevSess.deviceLocations,
              serverLocations: prevSess.serverLocations,
            },
            callbackURL: prevSess.callbackURL,
          }).catch(err => ({ error: err.message })) : Promise.resolve(true),
        ]).then(async (stopPluginsResult) => {
          if (prevSess.config.video) {
            const videoResult = stopPluginsResult[3]
            if (videoResult.error) {
              const errorMessage = "Failed to stop video recording " + (videoResult.error)
              session.video = { error: errorMessage }
              log.error(errorMessage)
            } else {
              const { recordingID, framerate, path: videoFilePath, videoFileName } = videoResult
              if (!!videoFileName && !!videoFilePath && !!recordingID) {
                session.video = { recordingID, framerate, videoFilePath, videoFileName }
              }
            }
          }

          if (isWindows && prevSess.config.qxdm) {
            const qxdmResult = stopPluginsResult[4]
            if (qxdmResult !== true) {
              if (qxdmResult.error) {
                const errorMessage = "Failed to stop qxdm " + qxdmResult.error
                session.qxdm = { error: errorMessage }
                log.error(errorMessage)
              } else {
                const { sessionId, logId, startLogTimestamp, endLogTimestamp, logFilePath, logFileName, services } = qxdmResult
                session.qxdm = { sessionId, logId, startLogTimestamp, endLogTimestamp, logFilePath, logFileName, services }
              }
            }
          }

          const saveStopExecution = {
            stopConfig: session.stopConfig,
            status: session.status,
            stopTimestamp: session.stopTimestamp,
            stoppedBy: session.stoppedBy,
            count: session.count,
            bugreports: session.bugreports,
            screenshots: session.screenshots,
          }
          if (session.video) {
            saveStopExecution.video = session.video
          }
          if (session.qxdm) {
            saveStopExecution.qxdm = session.qxdm
          }
          if (session.callbackURL) {
            saveStopExecution.callbackURL = session.callbackURL
          }
          const result = await dbapi.saveStopTestAssistExecution(session.executionID, saveStopExecution)

          const sess = {
            executionID: session.executionID,
            testCaseID: session.testCaseID,
            serial: options.serial,
            config: session.config,
            stopConfig: session.stopConfig,
            status: session.status,
            startTimestamp: session.startTimestamp,
            stopTimestamp: session.stopTimestamp,
            stoppedBy: session.stoppedBy,
            user: session.user,
            count: session.count,
            logcatPathname: session.logcatPathname,
            logcatFilename: session.logcatFilename,
            bugreports: session.bugreports,
            screenshots: session.screenshots,
            video: session.video,
            qxdm: session.qxdm,
            percentage: session.percentage,
            callbackURL: session.callbackURL,
          }
          session = resetSession(session)
          return sess
        }).catch((stopError) => {
          log.error("COULD NOT stop session: " + stopError.message)
          const sess = session
          session = resetSession(session)
          return sess
        }).finally(() => {
          session = resetSession(session)
        })
      }
      catch (stopError) {
        log.error("COULD NOT stop session: " + stopError.message)
        const sess = session
        session = resetSession(session)
        return sess
      }
    }

    plugin.generateBugReport = async function (customSess, previousGroup) {
      if (!customSess) {
        customSess = session
      }
      const currentGroup = previousGroup ? previousGroup : await group.get()
      const executionID = customSess.executionID
      return new Promise((resolve, reject) => {
        return adbutil.generateBugReportFile(options.serial, currentGroup.email)
          .then(async (brStartResult) => {
            log.info(`Generating bug report`)
            const filename = brStartResult.filename
            const path = brStartResult.path
            const interval = setInterval(async () => {
              adbutil.checkBugReportFileExist(filename, currentGroup.email)
                .then(result => {
                  clearInterval(interval)
                  if (result && result.exist) {
                    const [_, iterationID] = session.testCaseID.split("_$#$_")
                    const seq = customSess.bugreports.list.length + 1
                    const now = new Date()
                    const newBugReport = {
                      name: filename,
                      path: path,
                      timestamp: now,
                      remote: `${iterationID}_${options.serial}_bugreport_${seq}.zip`
                    }
                    customSess.bugreports.list.push(newBugReport)
                    dbapi.insertTestAssistBugReport(executionID, newBugReport)
                  } else {
                    log.error("Bugreport file does not exist")
                  }

                  customSess.bugreports.status = "ready"
                  push.send([
                    currentGroup.group
                    , wireutil.envelope(new wire.TestAssistBugReportStatusMessage(
                      options.serial,
                      customSess.bugreports.status,
                      customSess.bugreports.list.map(br => br.name),
                    ))
                  ])
                })
                .catch((err) => {
                  if (err.exist == false) {
                    // still not generated, you can ignore
                  } else {
                    log.error(`Error grabbing bugreport file after initiating generation: ${err.message}`)
                    reject(err)
                  }
                })
            }, 10000)

            customSess.bugreports.status = "generating"
            dbapi.updateTestAssistExecution(customSess.executionID, {
              bugreports: {
                status: customSess.bugreports.status
              }
            })

            resolve(customSess.bugreports)
          })
          .catch((err) => {
            log.error(`Error starting bugreport capture: ${err.message}`)
            reject(err)
          })
      })
    }

    plugin.captureScreenshot = async function () {
      const currentGroup = await group.get()
      return capture.captureForTestAssist(currentGroup.email.split("@")[0])
        .then(screenshot => {
          const [_, iterationID] = session.testCaseID.split("_$#$_")
          const seq = session.screenshots.length + 1
          screenshot.remote = `${iterationID}_${options.serial}_screenshot_${seq}.jpg`
          session.screenshots.push(screenshot)
          if (session.executionID) {
            dbapi.insertTestAssistScreenshot(session.executionID, screenshot)
          }
          return screenshot
        })
    }

    plugin.upload = function (executionID) {
      return promiseutil.progressNotify(async (resolve, reject, progress) => {
        const session = await dbapi.getTestAssistExecution(executionID)
        const testCaseID = session.testCaseID
        const [tc_executionID, tc_iterationID] = testCaseID.split("_$#$_")
        const tc_executionID_iterationID = `${tc_executionID}_${tc_iterationID}`
        let percent = session.percentage || 0
        progress(percent)

        // await onFinishSessionParseAndUploadCallback(session)

        const bugreportPaths = []
        const bugreportErrors = []
        const screenshotPaths = []
        const screenshotErrors = []
        let logcatFilePath
        let qxdmFilePath
        let videoFilePath

        const deviceData = await dbapi.getDeviceById(session.serial)
        const oemName = deviceData.manufacturer
        const deviceName = (deviceData.model || "").replace(/[\(\)_\s-]+/g, "-")
        const subfolder = `${oemName}_${deviceName}_${session.serial}`
        let baseDir = path.join(fileServerBasedir, session.stopConfig && session.stopConfig.database ? session.stopConfig.database : "testassist")
        const remoteDestinationDir = path.normalize(path.join(baseDir, tc_executionID_iterationID, subfolder))

        // upload logcat
        if (session.config.logcat && session.logcatPathname && session.logcatFilename) {
          const username = session.user.name
          const datestamp = session.startTimestamp.toISOString().split("T")[0]
          // const remoteDestinationDir = path.normalize(path.join(baseDir, /* datestamp, username, */ tc_executionID_iterationID, executionID))

          const subpercent = 12
          await tryMkDirRemote(remoteDestinationDir).then(async () => {
            const result = await uploadLogcatFile(session, session.logcatPathname, session.logcatFilename, session.remoteLogcatFilename, remoteDestinationDir)
            if (result !== false) {
              percent += Math.floor(subpercent)
              logcatFilePath = result
            }
            return result
          })
        } else if (session.status != "failed") {
          percent += 12
        }

        // upload bugreports
        if (session.bugreports && session.bugreports.list && session.bugreports.list.length > 0) {
          const bugreports = session.bugreports.list.filter(br => !br.status || br.status === 'failed')
          log.info(`Uploading ${bugreports.length} bugreports for ${executionID}...`)

          const username = session.user.name
          const datestamp = session.startTimestamp.toISOString().split("T")[0]
          // const remoteDestinationDir = path.normalize(path.join(baseDir, /* datestamp, username, */ tc_executionID_iterationID, executionID))

          const subpercent = 12 / session.bugreports.list.length
          await tryMkDirRemote(remoteDestinationDir).then(async (result) => {
            const allres = await Promise.all(
              bugreports.map(async report => {
                const result = await uploadBugreportFile(session, report, remoteDestinationDir)
                if (result !== false) {
                  percent += Math.floor(subpercent)
                  report.status = "uploaded"
                  bugreportPaths.push(result)
                } else {
                  bugreportErrors.push(report)
                }
                return result
              })
            )
          })
        } else if (session.status != "failed") {
          percent += 12
        }

        // upload screenshots
        if (session.screenshots && session.screenshots.length > 0) {
          const screenshots = session.screenshots.filter(s => !s.status || s.status === 'failed')
          log.info(`Uploading ${screenshots.length} screenshots for ${executionID}...`)

          const username = session.user.name
          const datestamp = session.startTimestamp.toISOString().split("T")[0]
          // const remoteDestinationDir = path.normalize(path.join(baseDir, /* datestamp, username, */ tc_executionID_iterationID, executionID))

          const subpercent = 12 / session.screenshots.length

          await tryMkDirRemote(remoteDestinationDir).then(async (result) => {
            const allres = await Promise.all(
              screenshots.map(async screenshot => {
                const result = await uploadScreenshot(session, screenshot, remoteDestinationDir)
                if (result !== false) {
                  percent += Math.floor(subpercent)
                  screenshot.status = "uploaded"
                  screenshotPaths.push(result)
                } else {
                  screenshotErrors.push(screenshot)
                }
                return result
              })
            )
          })
        } else if (session.status != "failed") {
          percent += 12
        }

        // upload qxdm
        if (session.config.qxdm && session.qxdm && session.qxdm.logFilePath) {
          log.info(`Uploading ${session.qxdm.logFilePath} for ${executionID}...`)

          const username = session.user.name
          const datestamp = session.startTimestamp.toISOString().split("T")[0]
          // const remoteDestinationDir = path.normalize(path.join(baseDir, /* datestamp, username, */ tc_executionID_iterationID, executionID))

          const subpercent = 12
          await tryMkDirRemote(remoteDestinationDir).then(async () => {
            const result = await uploadQXDMLog(session, session.qxdm, remoteDestinationDir)
            if (result !== false) {
              percent += Math.floor(subpercent)
              qxdmFilePath = result
            }
            return result
          })
        } else if (session.status != "failed") {
          percent += 12
        }

        // upload video
        if (session.config.video && session.video && session.video.videoFileName) {
          log.info(`Uploading ${session.video.videoFileName} for ${executionID}...`)

          const username = session.user.name
          const datestamp = session.startTimestamp.toISOString().split("T")[0]
          // const remoteDestinationDir = path.normalize(path.join(baseDir, /* datestamp, username, */ tc_executionID_iterationID, executionID))

          const subpercent = 12

          await tryMkDirRemote(remoteDestinationDir).then(async () => {
            const result = await uploadVideo(session, session.video, remoteDestinationDir)
            if (result !== false) {
              percent += Math.floor(subpercent)
              videoFilePath = result
            }
            return result
          })
        } else if (session.status != "failed") {
          percent += 12
        }

        let sessionEntry = {
          _executionID: session.executionID,
          _testCaseID: session.testCaseID,
          _serial: session.serial,
          _sessionStartTimestamp: session.startTimestamp,
          _sessionStopTimestamp: session.stopTimestamp,
          "_user.email": session.user.email,
          "_user.name": session.user.name,
          "_user.privilege": session.user.privilege,
          _entryType: "execution-info",
        }

        if (session.stopConfig) {
          if (session.stopConfig.sessionName) {
            sessionEntry._sessionName = session.stopConfig.sessionName
          }
          if (session.stopConfig.sessionDescription) {
            sessionEntry._sessionDescription = session.stopConfig.sessionDescription
          }
        }

        if (session.phoneData) {
          const phoneData = session.phoneData
          sessionEntry["ICCID"] = phoneData.ICCID
          sessionEntry["Number"] = phoneData.phoneNumber
        }
        if (session.operator) {
          sessionEntry["operator"] = session.operator
        }

        if (logcatFilePath) {
          sessionEntry._logcat = session.remoteLogcatFilename
        }
        if (qxdmFilePath) {
          sessionEntry._qxdm = qxdmFilePath.name
        }
        if (videoFilePath) {
          sessionEntry._video = videoFilePath.name
        }
        if (bugreportPaths.length > 0) {
          const _bugReports = bugreportPaths.reduce((acc, br, i) => {
            const index = `_bugReports[${i}]`
            acc[`${index}${'_'}name`] = br.remote
            acc[`${index}${'_'}path`] = br.path
            return acc
          }, {})
          sessionEntry = {
            ...sessionEntry,
            ..._bugReports,
          }
        }
        if (screenshotPaths.length > 0) {
          const _screenshots = screenshotPaths.reduce((acc, s, i) => {
            const index = `_screenshots[${i}]`
            acc[`${index}${'_'}name`] = s.remote
            acc[`${index}${'_'}path`] = s.path
            return acc
          }, {})
          sessionEntry = {
            ...sessionEntry,
            ..._screenshots,
          }
        }

        const updateRes = await mongodb.updateTestAssistExecutionInfo(
          session.stopConfig && session.stopConfig.collection ? session.stopConfig.collection : mongoCollection,
          session.executionID,
          sessionEntry,
          session.stopConfig ? session.stopConfig.database : null
        )

        const chunkSize = 10000
        let start = 1, end = chunkSize + 1
        let totalFetched = 0
        let totalInserted = 0

        const { insert, onSuccess, onFailed, onEnd } = await mongodb.insertTestAssistEntries(
          session.stopConfig && session.stopConfig.collection ? session.stopConfig.collection : mongoCollection,
          session.stopConfig ? session.stopConfig.database : null,
        )
        try {
          if (session.count > 0 && session.status != "failed") {
            function deserializeEntry(ent) {
              const { metadata, entry } = ent
              delete entry.timestamp
              return {
                _entryIndex: metadata.messageID,
                _entryType: metadata.type,
                entry: entry
              }
            }

            function serializeServerLocation(doc, locObj) {
              doc["_serverLocation.latitude"] = locObj.latitude
              doc["_serverLocation.longitude"] = locObj.longitude
            }

            function serializeDeviceLocation(doc, locObj) {
              doc["_location.latitude"] = locObj.latitude
              doc["_location.longitude"] = locObj.longitude
              doc["_location.provider"] = locObj.provider
            }

            const _metadataKeys = [
              "_executionID",
              "_testCaseID",
              "_entryType",
              "_serial",
              "_sessionStartTimestamp",
              "_sessionStopTimestamp",
              "_user",
              "_entriesTimestamp",
              "_serverLocation",
              "_location",
              "_serverLocation.latitude",
              "_serverLocation.longitude",
              "_location.latitude",
              "_location.longitude",
              "_location.provider",
              "_screenshots",
              "_bugReports",
            ]

            const _dataKeys = [
              "bands",
              "bandwidth",
              "earfcn",
              "mcc",
              "mnc",
              "network type",
              "pci",
              "rsrp",
              "rsrq",
              "rssi",
              "sinr",
              "connected",
              "failover",
              "roaming",
              "subtype",
              "type",
              "health",
              "scale",
              "source",
              "temp",
              "voltage",
              "alphaLong",
              // "arfcn",
              // "lac",
              // "mTa",
              "Carrier Name",
              "cpuCore0Current",
              "cpuCore0Max",
              "cpuCore1Current",
              "cpuCore1Max",
              "cpuCore2Current",
              "cpuCore2Max",
              "cpuCore3Current",
              "cpuCore3Max",
              "cpuCore4Current",
              "cpuCore4Max",
              "cpuCore5Current",
              "cpuCore5Max",
              "cpuCore6Current",
              "cpuCore6Max",
              "cpuCore7Current",
              "cpuCore7Max",
              "ramAvailable",
              "ramMax",
              "romAvailable",
              "romMax",
            ]

            const NULL_VALUE = 2147483647

            function flattenObject(obj, parentKey = '') {
              let result = {};

              for (let key in obj) {
                if (obj.hasOwnProperty(key)) {
                  let newKey = parentKey ? `${parentKey}.${key}` : key;

                  if (typeof obj[key] === 'object' && obj[key] !== null) {
                    // date
                    if (Object.prototype.toString.call(obj[key]) === "[object Date]") {
                      result[newKey] = obj[key]
                    } else {
                      // Recursively flatten nested objects
                      Object.assign(result, flattenObject(obj[key], newKey));
                    }
                  } else {
                    // Assign the value to the flattened key
                    result[newKey] = obj[key];
                  }
                }
              }

              return result;
            }

            const numRegex = /^(?=.)([+-]?([0-9]*)(\.([0-9]+))?)$/
            const bracketsRegex = /^\[(?=.)([+-]?([0-9]*)(\.([0-9]+))?)\]$/
            function parseEntryFields(data) {
              const obj = {}
              for (const key in data) {
                if (_metadataKeys.includes(key)) {
                  continue
                }
                const value = data[key];
                const finalKey = key.split('.').pop();
                if (value === "[]") {
                  continue
                }
                if (typeof value == 'number') {
                  const floatVal = parseFloat(value)
                  if (floatVal == NULL_VALUE) {
                    obj[finalKey] = null
                  } else {
                    obj[finalKey] = floatVal
                  }
                } else if ((typeof value == 'string')) {
                  if (numRegex.test(value)) {
                    const floatVal = parseFloat(value)
                    if (floatVal == NULL_VALUE) {
                      obj[finalKey] = null
                    } else {
                      obj[finalKey] = floatVal
                    }
                  } else {
                    if (bracketsRegex.test(value)) {
                      const numInBrackets = parseFloat(value.replace('[', '').replace(']', ''))
                      if (!isNaN(numInBrackets)) {
                        obj[finalKey] = numInBrackets
                      } else {
                        obj[finalKey] = value
                      }
                    } else {
                      obj[finalKey] = value
                    }
                  }
                } else {
                  obj[finalKey] = value
                }
              }
              return obj
            }

            function finalFormat(doc) {
              const metadata = {}
              for (let key in doc) {
                if (_metadataKeys.includes(key)) {
                  metadata[key] = doc[key]
                }
              }
              if ((!metadata["_serverLocation.latitude"]) && (!metadata["_location.latitude"])) {
                return null
              }

              let newDoc = flattenObject(metadata)

              const allFields = new Map()
              for (const entry of doc.entries) {
                const flattenedEntryData = flattenObject(entry.entry.message)
                const parsedFields = parseEntryFields(flattenedEntryData)

                for (key in parsedFields) {
                  if (_dataKeys.includes(key)) {
                    if (!allFields.has(key)) {
                      allFields.set(key, [])
                    }
                    allFields.get(key).push(parsedFields[key])
                  }
                }
              }

              if (allFields.size > 0) {
                const averagedFields = {}
                allFields.forEach((arr, key) => {
                  switch (typeof arr[0]) {
                    case "number":
                      averagedFields[key] = parseFloat((arr.reduce((acc, val) => acc + val, 0) / arr.length).toFixed(2))
                      break;
                    case "string":
                    case "boolean":
                      averagedFields[key] = arr[0]
                      break;
                  }
                })

                newDoc = {
                  ...newDoc,
                  ...averagedFields,
                }

                return newDoc
              } else {
                return null
              }
            }

            const timeMap = new Map()
            let lastDoc

            const subpercent = Math.floor(40 / (session.count / Math.min(session.count, chunkSize)))
            while (totalFetched <= session.count) {
              const entries = await dbapi.getTestAssistEntries(executionID, start, end)
              if (entries.length == 0) {
                break;
              }
              totalFetched += entries.length

              for (const ent of entries) {
                const { entry, metadata } = ent
                if (!metadata.timestamp) {
                  continue
                }

                const stamp = parseInt(metadata.timestamp.getTime() / 1000) // clamp to individual seconds

                const timeMapEntry = timeMap.get(stamp)
                if (timeMapEntry) {
                  if (isLocation(entry, metadata)) {
                    serializeDeviceLocation(timeMapEntry, entry.message)
                  }
                  if (isServerLocation(metadata)) {
                    serializeServerLocation(timeMapEntry, entry)
                  } else {
                    timeMapEntry.entries.push(deserializeEntry(ent))
                  }
                } else {
                  const newDoc = {
                    _executionID: session.executionID,
                    _testCaseID: session.testCaseID,
                    _serial: session.serial,
                    _sessionStartTimestamp: session.startTimestamp,
                    _sessionStopTimestamp: session.stopTimestamp,
                    _user: session.user,
                    _entriesTimestamp: new Date(stamp * 1000),
                  }
                  if (isLocation(entry, metadata)) {
                    serializeDeviceLocation(newDoc, entry.message)
                  }
                  if (isServerLocation(metadata)) {
                    serializeServerLocation(newDoc, entry)
                    newDoc.entries = []
                  } else {
                    newDoc.entries = [deserializeEntry(ent)]
                  }

                  timeMap.set(stamp, newDoc)
                }
              }

              const insertionArr = []
              const entriesArrayFromMap = Array.from(timeMap.entries())
              // pop last document so we have all documents minus the last one
              // (keep that one for next chunk fetched from local db to make sure we got all its second-specific entries)
              lastDoc = entriesArrayFromMap.pop()

              for (const document of entriesArrayFromMap) {
                const [stamp, doc] = document
                if (!doc.entries || !doc.entries.length) { // if no entries, skip
                  continue
                }

                const newDoc = finalFormat(doc)
                if (newDoc) {
                  totalInserted += doc.entries.length
                  insertionArr.push(newDoc)
                }
              }

              const [lastDocStamp, lastDocBody] = lastDoc
              timeMap.clear()
              timeMap.set(lastDocStamp, lastDocBody)

              log.info(`Inserting chunk with ${insertionArr.length} entries to mongodb: ${percent}% done`)
              await insert(insertionArr)
              percent += subpercent
              percent = Math.min(Math.floor(percent), 100)
              progress(percent)
              log.info(`Inserted ${totalInserted} entries to mongodb: ${percent}% done`)

              start = end
              end = end + chunkSize
            }

            // make sure last popped doc of last chunk is inserted
            if (timeMap.size == 1) {
              lastDoc = Array.from(timeMap.values())[0]
              const newDoc = finalFormat(lastDoc)
              if (newDoc) {
                await insert([newDoc])
                totalInserted += lastDoc.entries.length
                log.info(`Inserted ${totalInserted} entries to mongodb: ${percent}% done`)
              }
            }

          }
          session.status = bugreportErrors.length > 0 || screenshotErrors.length > 0 ? "failed" : "uploaded"
          session.percentage = Math.floor(percent)

          await dbapi.setTestAssistUploaded(executionID, session)

          if (session.status != "failed") await onSuccess()

          log.info(`Uploaded ${session.executionID} to mongodb`)
          resolve(session)
          dbapi.deleteTestAssistEntries(executionID)
        } catch (err) {
          await onFailed(err)
          reject(err)
        } finally {
          await onEnd()
        }
      })
    }

    plugin.deleteTestAssistExecution = async function (executionID, deleteEntriesOnly = false) {
      const session = await dbapi.getTestAssistExecution(executionID)
      if (session.logcatPathname && session.logcatFilename) {
        const logcatFile = path.join(session.logcatPathname, session.logcatFilename)
        try {
          fs.unlinkSync(logcatFile)
        } catch (err) {
          log.error(`Could not delete file ${logcatFile}: ${err.message}`)
        }
      }
      if (session.qxdm && session.qxdm.logFilePath) {
        try {
          fs.unlinkSync(session.qxdm.logFilePath)
        } catch (err) {
          log.error(`Could not delete file ${session.qxdm.logFilePath}: ${err.message}`)
        }
      }
      if (session.video && session.video.videoFileName) {
        try {
          fs.unlinkSync(session.video.videoFileName)
        } catch (err) {
          log.error(`Could not delete file ${session.video.videoFileName}: ${err.message}`)
        }
      }
      if (session.bugreports && session.bugreports.list && session.bugreports.list.length) {
        session.bugreports.list.forEach(report => {
          if (report.path) {
            try {
              fs.unlinkSync(report.path)
            } catch (err) {
              log.error(`Could not delete file ${report.path}: ${err.message}`)
            }
          }
        })
      }
      if (session.screenshots && session.screenshots.length) {
        session.screenshots.forEach(screenshot => {
          if (screenshot.path) {
            try {
              fs.unlinkSync(screenshot.path)
            } catch (err) {
              log.error(`Could not delete file ${screenshot.path}: ${err.message}`)
            }
          }
        })
      }

      return Promise.all([
        dbapi.deleteTestAssistEntries(executionID),
        deleteEntriesOnly ? Promise.resolve(true) : dbapi.deleteTestAssistExecution(executionID),
      ])
    }

    plugin.isRunning = function () {
      return !!session.executionID
    }

    plugin.isStopping = function () {
      return session.isStopping
    }

    lifecycle.observe(() => {
      if (plugin.isRunning()) {
        plugin.stop(null, null, "lifecycleEnded")
      } else {
        session.isStopping = false
      }
    })
    group.on('leave', (previousGroup) => {
      if (plugin.isRunning()) {
        plugin.stop(previousGroup, null, "groupLeft")
      } else {
        session.isStopping = false
      }
    })

    ////////////////////////////////////////////////////////////////////////////////////////////////

    router
      .on(wire.TestAssistStartMessage, function (channel, message) {
        let config = null
        if (message.config) {
          config = JSON.parse(message.config)
        }

        const reply = wireutil.reply(options.serial)
        plugin.start(message.testCaseID, message.serviceCommandIntervals, config)
          .then(function (session) {
            push.send([
              channel
              , reply.okay('success', session)
            ])
          })
          .catch(function (err) {
            log.error(err.message)
            push.send([
              channel
              , reply.fail("failed", err.message)
            ])
          })
      })
      .on(wire.TestAssistStopMessage, async function (channel, message) {
        let config = null
        if (message.config) {
          config = JSON.parse(message.config)
        }

        const reply = wireutil.reply(options.serial)
        if (plugin.isRunning()) {
          plugin.stop(null, config, message.stoppedBy)
            .then(function (session) {
              push.send([
                channel
                , reply.okay('success', session)
              ])
            })
            .catch(function (err) {
              log.error(err.message)
              push.send([
                channel
                , reply.fail('failed', err.message)
              ])
            })
        } else {
          push.send([
            channel
            , reply.okay('success')
          ])
        }
      })
      .on(wire.TestAssistGetStatusMessage, async function (channel, message) {
        const reply = wireutil.reply(options.serial)
        const isStopping = plugin.isStopping()
        const isRunning = plugin.isRunning()
        if(isStopping) {
          return push.send([
            channel
            , reply.okay('stopping')
          ])
        } else {
          if (isRunning) {
            push.send([
              channel
              , reply.okay('inprogress', {
                executionID: session.executionID,
                testCaseID: session.testCaseID,
                serial: options.serial,
                status: session.status,
                startTimestamp: session.startTimestamp,
                user: session.user,
                count: session.count,
                bugreports: session.bugreports,
                screenshots: session.screenshots,
              })
            ])
          } else {
            const latestSession = await dbapi.getLatestDeviceTestAssistExecution(options.serial)
            push.send([
              channel
              , reply.okay('none', latestSession)
            ])
          }
        }
      })
      .on(wire.TestAssistStartUploadMessage, function (channel, message) {
        const reply = wireutil.reply(options.serial)
        plugin.upload(message.executionID)
          .progressed(function (progress) {
            push.send([
              channel
              , reply.progress('uploading', progress, {
                executionID: message.executionID,
              })
            ])
          })
          .then(function (execution) {
            push.send([
              channel
              , reply.okay('success', {
                executionID: execution.executionID,
                testCaseID: execution.testCaseID,
                serial: options.serial,
                status: execution.status,
                startTimestamp: execution.startTimestamp,
                stopTimestamp: execution.stopTimestamp,
                user: execution.user,
                count: execution.count,
                percentage: execution.percentage,
              })
            ])
          })
          .catch(function (err) {
            log.error(err.message)
            push.send([
              channel
              , reply.fail('failed', err.message)
            ])
          })
      })
      .on(wire.TestAssistCaptureBugReportMessage, function (channel, message) {
        const reply = wireutil.reply(options.serial)
        plugin.generateBugReport()
          .then(function () {
            push.send([
              channel
              , reply.okay('success', session.bugreports)
            ])
          })
          .catch(function (err) {
            log.error(err.message)
            push.send([
              channel
              , reply.fail('failed', err.message)
            ])
          })
      })
      .on(wire.TestAssistOptInToBugReportMessage, function (channel, message) {
        const reply = wireutil.reply(options.serial)
        session.bugreports.optinBugreport = true
        push.send([
          channel
          , reply.okay('success', session.bugreports)
        ])
      })
      .on(wire.TestAssistDeleteMessage, function (channel, message) {
        const reply = wireutil.reply(options.serial)
        plugin.deleteTestAssistExecution(message.executionID, message.deleteEntriesOnly ? message.deleteEntriesOnly : false)
          .then(function (result) {
            result
            push.send([
              channel
              , reply.okay('success')
            ])
          })
          .catch(function (err) {
            log.error(err.message)
            push.send([
              channel
              , reply.fail('failed', err.message)
            ])
          })
      })
      .on(wire.TestAssistScreenshotMessage, function (channel, message) {
        const reply = wireutil.reply(options.serial)
        plugin.captureScreenshot()
          .then(function () {
            push.send([
              channel
              , reply.okay('success', session.screenshots)
            ])
          })
          .catch(function (err) {
            log.error(err.message)
            push.send([
              channel
              , reply.fail('failed', err.message)
            ])
          })
      })
      .on(wire.ServerLocationResultMessage, function (channel, message) {
        if (message.serial == options.serial) {
          if (!!message.latitude && !!message.longitude) {
            const now = new Date()
            if(isWindows && session.config.qxdm) {
              session.serverLocations.push({
                latitude: message.latitude,
                longitude: message.longitude,
                timestamp: now
              })
            }
            const fullEntry = mapMetadataToEntry({
              latitude: message.latitude,
              longitude: message.longitude,
            })
            const serverLocationEntry = {
              metadata: {
                type: "server-location",
                ...fullEntry.metadata,
                timestamp: now,
              },
              entry: fullEntry.entry
            }
            session.entriesQueue.push(serverLocationEntry)
          }
        }
      })

    return plugin.init()
  })
