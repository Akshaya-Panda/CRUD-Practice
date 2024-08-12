const _ = require('lodash')

module.exports = function ManualTestAssistCtrl(
  $scope,
  $routeParams,
  socket,
  $timeout,
  $http,
  socket,
  UserService,
) {
  const serial = $routeParams.serial
  const $ctrl = this;

  $scope.allPending = true;
  $scope.pending = false;
  $scope.pendingBugreport = false;
  $scope.optInBugreport = false;
  $scope.history = [];
  $scope.isGenerating = false;
  $scope.bugreportData = { status: 'discarding', bugreports: [] }
  $scope.screenshots = []
  $scope.session = {
    testCaseID: "",
  }
  $scope.checkboxes = {
    logcatLogs: false,
    bugreport: false,
    radioLogs: false,
    video: false,
    audio: false,
  };
 
  $scope.showCustomizeButton = {
    logcatLogs: false,
    bugreport: false,
    radioLogs: false,
    video: false,
    audio: false,
  };
  $scope.showLogscatPanel = false;
  
  $scope.$watch('session.testCaseID', function (newValue) {
    $scope.testCaseID = newValue;
  })
  
  $scope.updateCustomizeButton = function (checkboxKey) {
    console.log("asdfgh")
    $scope.showCustomizeButton[checkboxKey] = $scope.checkboxes[checkboxKey];
  };
 
  $scope.openLogscatPanel = function () {
    console.log("wqerdfgh")
    $scope.showLogscatPanel = true;
    console.log("DFGHJGFGH",$scope.showLogscatPanel)
    
  };
 
  $scope.closeLogscatPanel = function () {
    $scope.showLogscatPanel = false;
    console.log("close hoja bhai")
  };
  
  $scope.serviceCommands = [
    { name: "Telephony", interval: 5000 },
    { name: "Network Bandwidth", interval: 5000 },
    { name: "Data Connection Status", interval: 5000 },
    { name: "Network Operator", interval: 5000 },
  ]
  $scope.isAdmin = UserService.currentUser.privilege == 'admin'

  init()

  function init() {
    getTestAssistHistory()
      .then(getTestAssistStatus)
      .finally(function () {
        $scope.allPending = false
      })
  }

  function getTestAssistHistory() {
    return $http.get(`/api/v1/devices/session/${serial}/history?isUi=true`).then(function (response) {
      $scope.history = response.data.history.map(newTC => {
        const oldTC = $scope.history.find((oldTC) => oldTC.executionID === newTC.executionID)
        if (oldTC && oldTC.isUploading) {
          return oldTC
        } else {
          return newTC
        }
      })
    }).catch(function (error) {
      console.error("Error fetching test assist history" + error)
    })
  }

  function getTestAssistStatus() {
    return $scope.control.getTestAssistStatus()
      .then(function (result) {
        if (result.body) {
          $scope.session = result.body
          if (result.lastData == "inprogress") {
            $scope.bugreportData = {
              bugreports: result.body.bugreports.list,
              status: result.body.bugreports.status
            }
            $scope.screenshots = result.body.screenshots
          }
        }
        return $scope.isGenerating = result.lastData === "inprogress"
      })
  }

  $scope.startTestAssist = function () {
    if (!!$scope.testCaseID) {
      $scope.pending = true
      $scope.control.startTestAssist($scope.testCaseID, $scope.serviceCommands.map(cmd => cmd.interval))
        .then(function (result) {
          $scope.isGenerating = true
          if (result.body) {
            $scope.session = result.body
            if (result.body.bugreports && result.body.bugreports.status == "discarding") {
              $scope.bugreportData.status = 'discarding'
            }
          }
        })
        .catch(function (err) {
          console.error(`Error starting test execution: ${err.message}`)
        }).finally(function () {
          $scope.pending = false
        })
    }
  }

$scope.stopTestAssist = function () {
    $scope.pending = true
    $scope.control.stopTestAssist()
      .then(function (result) {
        if (result.body) {
          $scope.session = result.body
          if (result.body.bugreports && result.body.bugreports.status == "discarding") {
            $scope.bugreportData.status = 'discarding'
          }
          $scope.screenshots = []
        }
        return getTestAssistHistory()
      })
      .catch(function (err) {
        console.error(`Error stopping test execution: ${err.message}`)
      }).finally(function () {
        $scope.isGenerating = false
        $scope.pending = false
        $scope.optInBugreport = false
      })
  }

  $scope.startBugreportCapture = function () {
    $scope.pendingBugreport = true
    $scope.control.startTestAssistBugreportCapture()
      .then(function (result) {
        $scope.bugreportData.status = "generating"
      }).catch(function (err) {
        console.log(`Error starting bugreport capture: ${err.message}`)
      }).finally(() => {
        $scope.pendingBugreport = false
      })
  }

  $scope.optInToBugreport = function () {
    $scope.control.testAssistOptInToBugreport()
      .then(function (result) {
        $scope.optInBugreport = true
      }).catch(function (err) {
        console.log(`Error opting in to bugreport: ${err.message}`)
      })
  }

  $scope.captureScreenshot = function () {
    $scope.isCapturingScreenshot = true
    $scope.control.testAssistCaptureScreenshot()
      .then(function (result) {
        $scope.screenshots = result.body
      }).catch(function (err) {
        console.log(`Error capturing screenshot: ${err.message}`)
      })
      .finally(() => {
        $scope.isCapturingScreenshot = false
      })
  }

  $scope.upload = function (testCase) {
    const { executionID } = testCase

    testCase.isUploading = true
    testCase.uploadProgress = testCase.percentage || 0
    $scope.control.startTestAssistUpload(executionID)
      .progressed(function (result) {
        testCase.uploadProgress = result.progress
      }).then(function (result) {
        testCase.status = result.body.status
        testCase.percentage = result.body.percentage
      }).catch(function (err) {
        console.log(`Error uploading: ${err.message}`)
      }).finally(function () {
        testCase.isUploading = false
      })
  }

  $scope.deleteExecution = function (testCase) {
    const { executionID } = testCase

    $scope.control.deleteTestAssistExecution(executionID)
      .then(function (result) {
        return getTestAssistHistory()
      }).catch(function (err) {
        console.log(`Error deleting: ${err.message}`)
      })
  }

  socket.on('testassist.bugreport.status', function (result) {
    if (!result) {
      throw new Error("Failed to start bugreport capture")
    }

    $scope.showBugreportCaptureDoneMessage =
      result.status === "ready"
      && result.bugreports
      && result.bugreports.length > (
        $scope.bugreportData && $scope.bugreportData.bugreports && $scope.bugreportData.bugreports.length
          ? $scope.bugreportData.bugreports.length
          : 0
      )

    $timeout(function () {
      $scope.showBugreportCaptureDoneMessage = false
    }, 6000);

$scope.bugreportData = {
      bugreports: result.bugreports,
      status: result.status,
    }

    if (result.status === 'ready') {
      $scope.optInBugreport = false
      try {
        $scope.$apply()
      } catch (err) {
        // no-op
      }
      return getTestAssistHistory()
    }
  })

  $scope.translateStatus = function (testCase) {
    switch (testCase.status) {
      case 'started':
        return "In progress"
      case 'stopped':
        return "Ready to upload"
      case 'uploaded':
        return "Uploaded"
      case 'failed':
        const percentage = testCase.percentage || 0
        return `Failed (at ${percentage}%)`
      default:
        return "Unknown"
    }
  }
};
