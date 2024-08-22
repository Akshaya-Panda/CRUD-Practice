/**
* Copyright © 2019 code initially contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

module.exports = function ManualTestAssistCtrl(
  $scope,
  $routeParams,
  socket,
  $timeout,
  $http,
  socket,
  UserService,
  QxdmService
) {
  const serial = $routeParams.serial
  const $ctrl = this;

  $scope.allPending = true;
  $scope.pending = false;
  $scope.pendingBugreport = false;
  $scope.optInBugreport = false;
  $scope.history = [];
  $scope.isGenerating = false;
  $scope.bugreportData = { status: 'discarding', bugreports: [] };
  $scope.screenshots = [];
  $scope.frameRate = "30"; // Default frame rate
  $scope.customLogName = "";
  $scope.session = {
    testCaseID: "",
    description: "",
    radioLogs: {
      maskFile: null,
      packets: ""
    },
    video: {
      frameRate: $scope.frameRate
    },
    logcatLogs: "",
    bugreport: "",
    audio: ""
  };
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
  
  $scope.currentCustomization = {
    radioLogs: {
      maskFile: null,
      packets: '',
      visible: false
    },
    video: {
      frameRate: $scope.frameRate,
      visible: false
    },
    logcatLogs: {
      visible: false
    },
    bugreportAction: {
      visible: false
    },
    audio: {
      visible: false
    }
  };
  
  $scope.showLogscatPanel = false;
  $scope.isRunning = false;
  $scope.logtype = '';
  $scope.maskFile = '';
  $scope.packets = '';
  $scope.frameRate = '';
  $scope.showCustomizeButton = {};
  $scope.isViewing = false;
  $scope.maskFiles = [{ maskFile: "Default DMC", id: null }];
  $scope.selectedMaskFile = $scope.maskFiles[0];
  
  $scope.bugreportAction = 'continue';
  
  $scope.updateBugreportAction = function() {
    $scope.session.bugreportAction = $scope.bugreportAction;
  };
  
  $scope.initializeSession = function() {
    $scope.session = {
      testCaseID: $scope.session.testCaseID || '',
      description: $scope.session.description || '',
      logcatLogs: $scope.session.logcatLogs || '',
      bugreportAction: $scope.session.bugreportAction || '',
      radioLogs: {
        maskFile: $scope.session.radioLogs.maskFile || null,
        packets: $scope.session.radioLogs.packets || ''
      },
      video: {
    frameRate: $scope.session.video.frameRate || ''
      },
    audio: $scope.session.audio || ''
    };
  };
  
  $scope.$watch('bugreportAction', function(newValue, oldValue) {
    if (newValue !== oldValue) {
      $scope.updateBugreportAction();
    }
  });
  
  $scope.$watch('session.testCaseID', function(newValue) {
    $scope.testCaseID = newValue;
  });
  
  $scope.updateCustomizeButton = function(checkboxKey) {
    $scope.showCustomizeButton[checkboxKey] = $scope.checkboxes[checkboxKey];
  };
  
  $scope.openLogscatPanel = function(type) {
    $scope.logtype = type;
    $scope.customLogName = type.charAt(0).toUpperCase() + type.slice(1);
    $scope.showLogscatPanel = true;
 
    switch(type) {
      case 'radioLogs':
        $scope.selectedMaskFile = $scope.session.radioLogs.maskFile || $scope.maskFiles[0];
        $scope.packets = $scope.session.radioLogs.packets || '';
        break;
      case 'video':
$scope.frameRate = $scope.session.video.frameRate || '30'; 
        break;
      case 'logcatLogs':
        
        break;
      case 'bugreportAction':
        $scope.bugreportAction =$scope.session.bugreportAction
        break;
      case 'audio':
       
        break;
    }
  };
  $scope.closeLogscatPanel = function() {
    $scope.showLogscatPanel = false;
    $scope.logtype = '';
  };
  
  $scope.saveCustomization = function() {
    switch($scope.logtype) {
      case 'radioLogs':
        $scope.session.radioLogs = {
          maskFile: $scope.selectedMaskFile,
          packets: $scope.packets,
          visible: true
        };
        break;
      case 'video':
          $scope.session.video = {
          frameRate: $scope.frameRate,
          visible: true
        };
        break;
      case 'logcatLogs':
        $scope.session.logcatLogs.visible = true;
        break;
      case 'bugreportAction':
        $scope.session.bugreportAction.visible = true;
        break;
      case 'audio':
        $scope.session.audio.visible = true;
        break;
    }
 
    alert('Customization saved successfully!');
  };
  
  $scope.clearCustomization = function() {
    switch($scope.logtype) {
      case 'radioLogs':
        $scope.selectedMaskFile = $scope.maskFiles[0];
        $scope.packets = '';
        $scope.session.radioLogs = {
          maskFile: null,
          packets: '',
          visible: false
        };
        break;
      case 'video':
        $scope.frameRate = '30';
        $scope.session.video = {
          frameRate: '',
          visible: false
        };
        break;
      case 'logcatLogs':
        
        break;
      case 'bugreportAction':
       $scope.session.bugreportAction = {
        bugreportAction:'continue',
       visible:false
       };
        break;
      case 'audio':
        
        break;
    }
 
    alert('Customization cleared successfully!');
    $scope.initializeSession();
  };  
  
  $scope.toggleStartStop = function() {
    $scope.isRunning = !$scope.isRunning;
    $scope.isViewing = true;
    
    if (!$scope.isRunning) {
      $scope.checkboxes = {
        logcatLogs: false,
        bugreport: false,
        radioLogs: false,
        video: false,
        audio: false
      };
      $scope.stopTestAssist=function(){
      window.location.reload();}
      $scope.showCustomizeButton = {};
    }
    else{
      $scope.startTestAssist();
      //$scope.initializeSession();
      
    }
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
    /*   .then(getTestAssistStatus) */
      .then(async function (device) {
        
        $scope.maskFiles.push(...device.qxdm.maskFiles || [])
        console.log($scope.maskFiles)
      }).catch(function (err) {
        $scope.error = err
      }).finally(function () {
        $scope.allPending = false
      })
      console.log($scope.device.qxdm.maskFiles,"console ke bahar wala hun mein")
      
  }
  
  
  /* function loadMaskFiles() {
    QxdmService.selectMaskFile() // Ensure this service is implemented to fetch mask files
      .then(function (response) {
        $scope.maskFiles = [{ maskFile: "Default DMC", id: null }].concat(response.data || []);
        $scope.selectedMaskFile = $scope.maskFiles[0];
      })
      .catch(function (error) {
        console.error("Error fetching mask files", error);
      });
  } */

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
  
  $scope.selectMaskFile = function (maskFile) 
  {
    $scope.selectedMaskFile = maskFile
        
  
  }
      

  /* $scope.startTestAssist = function () {
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
  } */
 
    $scope.startTestAssist = function () {
      if ($scope.session.testCaseID) {
        
        
        // Prepare the data to send
        var testData = {
          testCaseID: $scope.session.testCaseID,
          description: $scope.session.description,
          logcatLogs: $scope.checkboxes.logcatLogs ? $scope.currentCustomization.logcatLogs : null,
          bugreport: $scope.checkboxes.bugreport ? $scope.currentCustomization.bugreport : null,
          qxdm: $scope.checkboxes.radioLogs ? $scope.currentCustomization.radioLogs : null,
          video: $scope.checkboxes.video ? $scope.currentCustomization.video : null,
          audio: $scope.checkboxes.audio ? $scope.currentCustomization.audio : null
        };
        console.log("started")
     
        $scope.control.startTestAssist(testData.testCaseID, $scope.serviceCommands.map(cmd => cmd.interval))
          .then(function (result) {
            $scope.isRunning = true;
            console.log("inside control.startAssist")
            if (result.body) {
              $scope.session = result.body;
              if (result.body.bugreports && result.body.bugreports.status == "discarding") {
                $scope.bugreportData.status = 'discarding';
              }
            }
          })
          .catch(function (err) {
            console.error(`Error starting test execution: ${err.message}`);
          }).finally(function () {
            $scope.pending = false;
          
          });
      }
    };

  /* $scope.stopTestAssist = function () {
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
  } */
 
      $scope.stopTestAssist = function () {
        
        $scope.control.stopTestAssist()
          .then(function (result) {
            console.log("stopped")
            if (result.body) {
              $scope.session = result.body;
              if (result.body.bugreports && result.body.bugreports.status == "discarding") {
                $scope.bugreportData.status = 'discarding';
              }
              $scope.screenshots = [];
            }
            return getTestAssistHistory();
          })
          .catch(function (err) {
            console.error(`Error stopping test execution: ${err.message}`);
          }).finally(function () {
            $scope.isRunning = false;
            
            $scope.optInBugreport = false;
          });
      };
      
      $scope.updateRadioLogs = function() {
        $scope.session.radioLogs.maskFile = $scope.selectedMaskFile;
        $scope.session.radioLogs.packets = $scope.packets;
      };
       
      $scope.updateVideoSettings = function() {
      $scope.session.video.frameRate = $scope.frameRate;
      };
      
      
      

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
