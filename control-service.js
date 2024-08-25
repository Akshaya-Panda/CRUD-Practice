module.exports = function ControlServiceFactory(
  $upload
, $http
, socket
, TransactionService
, $rootScope
, gettext
, KeycodesMapped
, UserService
) {
  var controlService = {
  }

  function ControlService(target, channel) {
    function sendOneWay(action, data) {
      socket.emit(action, channel, data)
    }

    function sendTwoWay(action, data) {
      var tx = TransactionService.create(target)
      socket.emit(action, channel, tx.channel, data)
      return tx.promise
    }

    function keySender(type, fixedKey) {
      return function (key) {
        if (typeof key === 'string') {
          sendOneWay(type, {
            key: key
          })
        }
        else {
          var mapped = fixedKey || KeycodesMapped[key]
          if (mapped) {
            sendOneWay(type, {
              key: mapped
            })
          }
        }
      }
    }

    this.gestureStart = function (seq) {
      sendOneWay('input.gestureStart', {
        seq: seq
      })
    }

    this.gestureStop = function (seq) {
      sendOneWay('input.gestureStop', {
        seq: seq
      })
    }

    this.touchDown = function (seq, contact, x, y, pressure) {
      sendOneWay('input.touchDown', {
        seq: seq
        , contact: contact
        , x: x
        , y: y
        , pressure: pressure
      })
    }

    this.touchMove = function (seq, contact, x, y, pressure) {
      sendOneWay('input.touchMove', {
        seq: seq
        , contact: contact
        , x: x
        , y: y
        , pressure: pressure
      })
    }

    this.touchUp = function (seq, contact) {
      sendOneWay('input.touchUp', {
        seq: seq
        , contact: contact
      })
    }

    this.touchCommit = function (seq) {
      sendOneWay('input.touchCommit', {
        seq: seq
      })
    }

    this.touchReset = function (seq) {
      sendOneWay('input.touchReset', {
        seq: seq
      })
    }

    this.keyDown = keySender('input.keyDown')
    this.keyUp = keySender('input.keyUp')
    this.keyPress = keySender('input.keyPress')

    this.home = keySender('input.keyPress', 'home')
    this.menu = keySender('input.keyPress', 'menu')
    this.back = keySender('input.keyPress', 'back')
    this.appSwitch = keySender('input.keyPress', 'app_switch')

    this.type = function (text) {
      return sendOneWay('input.type', {
        text: text
      })
    }

    this.paste = function (text) {
      return sendTwoWay('clipboard.paste', {
        text: text
      })
    }

    this.copy = function () {
      return sendTwoWay('clipboard.copy')
    }

    //@TODO: Refactor this please
    var that = this
    this.getClipboardContent = function () {
      that.copy().then(function (result) {
        $rootScope.$apply(function () {
          if (result.success) {
            if (result.lastData) {
              that.clipboardContent = result.lastData
            } else {
              that.clipboardContent = gettext('No clipboard data')
            }
          } else {
            that.clipboardContent = gettext('Error while getting data')
          }
        })
      })
    }

    this.shell = function (command) {
      return sendTwoWay('shell.command', {
        command: command
        , timeout: 10000
      })
    }

    this.openMessenger = function () {
      return sendTwoWay('sms.open')
    }
    
    this.openDialer = function () {
      return sendTwoWay('dialer.open')
    }
    
    this.identify = function () {
      return sendTwoWay('device.identify')
    }

    this.install = function (options) {
      return sendTwoWay('device.install', options)
    }

    this.uninstall = function (pkg) {
      return sendTwoWay('device.uninstall', {
        packageName: pkg
      })
    }

    this.reboot = function () {
      return sendTwoWay('device.reboot')
    }
    
    this.reconnect = function () {
      return sendTwoWay('device.reconnect')
    }

    this.rotate = function (rotation, lock) {
      return sendOneWay('display.rotate', {
        rotation: rotation,
        lock: lock
      })
    }

    this.testForward = function (forward) {
      return sendTwoWay('forward.test', {
        targetHost: forward.targetHost
        , targetPort: Number(forward.targetPort)
      })
    }

    this.createForward = function (forward) {
      return sendTwoWay('forward.create', {
        id: forward.id
        , devicePort: Number(forward.devicePort)
        , targetHost: forward.targetHost
        , targetPort: Number(forward.targetPort)
      })
    }

    this.removeForward = function (forward) {
      return sendTwoWay('forward.remove', {
        id: forward.id
      })
    }

    this.startLogcat = function (filters) {
      return sendTwoWay('logcat.start', {
        filters: filters
      })
    }

    this.stopLogcat = function () {
      return sendTwoWay('logcat.stop')
    }
    
    this.startDeviceInfoLog = function() {
      return sendTwoWay('infolog.start')
    }

    this.stopDeviceInfoLog = function() {
      return sendTwoWay('infolog.stop')
    }

    this.startTestAssist = function(testData) {
      console.log(testData , 'scsddsdsdsdsdsdsddsdsds')
      return sendTwoWay('testassist.start', {
          testCaseID: testData.testCaseID,
          description: testData.description,
          logs: testData.logs,
          
      });
  };

    this.stopTestAssist = function () {
      return sendTwoWay('testassist.stop')
    }
    
    this.getTestAssistStatus = function () {
      return sendTwoWay('testassist.status')
    }
    
    this.startTestAssistUpload = function (executionID) {
      return sendTwoWay('testassist.upload', {
        executionID: executionID,
      })
    }
    
    this.deleteTestAssistExecution = function (executionID) {
      return sendTwoWay('testassist.delete', {
        executionID: executionID,
      })
    }
    
    this.startTestAssistBugreportCapture = function () {
      return sendTwoWay('testassist.bugreport.capture')
    }
    
    this.testAssistOptInToBugreport = function () {
      return sendTwoWay('testassist.bugreport.optin')
    }
    
    this.testAssistCaptureScreenshot = function () {
      return sendTwoWay('testassist.screenshot.capture')
    }

    this.startRemoteConnect = function () {
      return sendTwoWay('connect.start')
    }

    this.stopRemoteConnect = function () {
      return sendTwoWay('connect.stop')
    }
    
    this.startQXDMLogs = function(maskFile) {
      const data = {
        email: UserService.currentUser.email,
      }
      if (maskFile) data.maskFile = maskFile
      return sendTwoWay('qxdm.start', data)
    }

    this.stopQXDMLogs = function() {
      return sendTwoWay('qxdm.stop', {
        email: UserService.currentUser.email,
      })
    }
    
    this.getQXDMLogStatus = function() {
      return sendTwoWay('qxdm.log.status')
    }


    this.openBrowser = function (url, browser) {
      return sendTwoWay('browser.open', {
        url: url
        , browser: browser ? browser.id : null
      })
    }

    this.clearBrowser = function (browser) {
      return sendTwoWay('browser.clear', {
        browser: browser.id
      })
    }

    this.openStore = function () {
      return sendTwoWay('store.open')
    }

    this.screenshot = function () {
      return sendTwoWay('screen.capture')
    }
    
    this.startScreenRecording = function (framerate) {
      const email = UserService.currentUser.email
      return sendTwoWay('screen.record.start', {
        id: email,
        email: email,
        framerate: framerate,
      })
    }
    
    this.stopScreenRecording = function() {
      return sendTwoWay('screen.record.stop', {
        id: UserService.currentUser.email,
      })
    }
    
    this.getScreenRecordingStatus = function() {
      return sendTwoWay('screen.record.status', {
        id: UserService.currentUser.email,
      })
    }

    this.fsretrieve = function (file, isDir) {
      return sendTwoWay('fs.retrieve', {
        file: file,
        isDir: isDir
      })
    }

    this.fslist = function (dir) {
      return sendTwoWay('fs.list', {
        dir: dir
      })
    }

    this.checkAccount = function (type, account) {
      return sendTwoWay('account.check', {
        type: type
        , account: account
      })
    }

    this.removeAccount = function (type, account) {
      return sendTwoWay('account.remove', {
        type: type
        , account: account
      })
    }

    this.addAccountMenu = function () {
      return sendTwoWay('account.addmenu')
    }

    this.addAccount = function (user, password) {
      return sendTwoWay('account.add', {
        user: user
        , password: password
      })
    }

    this.getAccounts = function (type) {
      return sendTwoWay('account.get', {
        type: type
      })
    }

    this.getSdStatus = function () {
      return sendTwoWay('sd.status')
    }

    this.setRingerMode = function (mode) {
      return sendTwoWay('ringer.set', {
        mode: mode
      })
    }

    this.getRingerMode = function () {
      return sendTwoWay('ringer.get')
    }

    this.openCamera = function() {
      return sendTwoWay('camera.open')
    }

    this.setWifiEnabled = function(enabled) {
      return sendTwoWay('wifi.set', {
        enabled: enabled
      })
    }

    this.getWifiStatus = function () {
      return sendTwoWay('wifi.get')
    }

    this.runSpeedTest = function() {
      return sendTwoWay('speedTest.runSpeedTest')
    }

    this.startCapturingDeviceLogsForDetachMode = function () {
      return sendTwoWay('detachMode.startCapture')
    }

    this.stopCapturingDeviceLogsForDetachMode = function (data) {
      return sendTwoWay('detachMode.stopCapture',data)
    }
    this.stopedCapturingDeviceLogsForDetachMode = function (data) {
      return sendTwoWay('detachMode.stopedCapture',data)
    }
    this.statusDeviceLogsForDetachMode = function (data) {
      return sendTwoWay('detachMode.captureStatus',data)
    }
    window.cc = this
  }

  controlService.create = function (target, channel) {
    return new ControlService(target, channel)
  }

  return controlService
}
