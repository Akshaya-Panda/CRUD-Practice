/**
* Copyright © 2019 code initially contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

const _ = require('lodash')


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
  $scope.isCapturingScreenshot = false;
  $scope.pending = false;
  $scope.pendingBugreport = false;
  $scope.optInBugreport = false;
  $scope.history = [];
  $scope.isGenerating = false;
  $scope.bugreportData = { status: 'discarding', bugreports: [] };
  $scope.screenshots =  [];
  $scope.frameRate = "15";
  $scope.customLogName = "";
  $scope.demoMaskFiles;
  var isHistory = false
  var cachedPath = `screenshots_${$scope.device.serial}`
  var screenshotsJson = sessionStorage.getItem(cachedPath)
  $scope.screenshots = screenshotsJson? JSON.parse(screenshotsJson): []
  $scope.screenShotSize = 400

 /*  $scope.session= {
    testCaseID: "",
    description: "",
    radioLogs: {
      maskFile: null,
      packets: ""
    },
    video: {
      frameRate: "15"
    },
    logcatLogs: "",
    bugreport: "",
    audio: ""
  }; */
  $scope.session= {
    testCaseID: "",
    description: "",
    config:{
    qxdm: {
      maskFile: null,
      packets: "",
      qxdmOption: "maskFile",
      selectedMaskFile: null,
      
    },
    video: {
      frameRate: "15"
    },
    logcatLogs: "",
    bugreport: "continue",
    audio: ""
  },
};
  $scope.checkboxes = {
    logcatLogs: false,
    bugreport: false,
    qxdm: false,
    video: false,
    audio: false,
  };
  $scope.showCustomizeButton = {
    logcatLogs: false,
    bugreport: false,
    qxdm: false,
    video: false,
    audio: false,
  };
  
  $scope.currentCustomization = {
    qxdm: {
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
  $scope.showHistory= false;
  $scope.logtype = '';
  $scope.maskFile = '';
  $scope.packets = '';
  $scope.frameRate = '';
  $scope.showCustomizeButton = {};
  $scope.isViewing = false;
  $scope.maskFiles = [{ maskFile: "Default DMC"} ];
  $scope.selectedMaskFile = $scope.maskFiles[0];
  $scope.qxdmCapable = false
  
  
  $scope.session.logsOption = 'uploadDB';
  $scope.session.config.bugreportAction = 'continue';
  $scope.session.config.qxdmOption = 'maskFile'
  
  $scope.updateBugreportAction = function() {
    $scope.bugreportAction = $scope.session.config.bugreportAction;
  };
  
  
  
  $scope.initializeSession = function() {
    $scope.session = {
      testCaseID: $scope.session.testCaseID || '',
      description: $scope.session.description || '',
      logcatLogs: $scope.session.config.logcatLogs || '',
      bugreportAction: $scope.session.config.bugreportAction || '',
      qxdm: {
        maskFile: $scope.session.config.qxdm.maskFile || null,
        packets: $scope.session.config.qxdm.packets || ''
      },
      video: {
    frameRate: $scope.session.config.video.frameRate || '15'
      },
    audio: $scope.session.config.audio || ''
    };
  };
  
  /* $scope.$watch('bugreportAction', function(newValue, oldValue) {
    if (newValue !== oldValue) {
      $scope.session.bugreportAction = newValue;
      console.log("new value is being selected")
    }
    console.log("OLD VALUE")
  }); */
  $scope.$watch('bugreportAction', $scope.updateBugreportAction);
  
  $scope.$watch('session.testCaseID', function(newValue) {
    $scope.testCaseID = newValue;
  });
  
  $scope.$watch('session.logsOption', function(){
    $scope.logsOption = 'uploadDB';
  });
  
  /* $scope.updatePostProcessing = function()
  {
   $scope.session.logsOption = $scope.logsOption; 
  } */
  
  $scope.updateCustomizeButton = function(checkboxKey) {
    $scope.showCustomizeButton[checkboxKey] = $scope.checkboxes[checkboxKey];
  };
  
  $scope.updateQxdmSelection = function(device) {
    if ($scope.session.config.qxdm.qxdmOption === 'maskFile') {
     
      
      console.log($scope.device.qxdm.maskFiles.map(item => item.maskFile),"$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$")
      $scope.session.config.qxdm.selectedMaskFile =  [...$scope.device.qxdm.maskFiles.map(item => item.maskFile),$scope.maskFiles[0].maskFile]  ;
      $scope.demoMaskFiles =  $scope.session.config.qxdm.selectedMaskFile;
      console.log($scope.session.config.qxdm.selectedMaskFile,"#####################################")
      $scope.session.config.qxdm.packets = '';  
    } else {
      
      $scope.session.config.qxdm.selectedMaskFile = null;
      $scope.session.config.qxdm.maskFile = null;
    }
  };
  
  $scope.selectMaskFile = function() {
    $scope.session.config.qxdm.maskFile = $scope.session.config.qxdm.selectedMaskFile;
  };
  
 

  $scope.openLogscatPanel = function(type) {
    $scope.logtype = type;
    $scope.customLogName = type.charAt(0).toUpperCase() + type.slice(1);
    $scope.showLogscatPanel = true;
 
    switch(type) {
      case 'qxdm':
       // $scope.selectedMaskFile = [...$scope.device.qxdm.maskFiles.map(item => item.maskFile),$scope.maskFiles[0].maskFile] ;
       $scope.session.config.qxdm.selectedMaskFile =  [...$scope.device.qxdm.maskFiles.map(item => item.maskFile),$scope.maskFiles[0].maskFile]  ;
       $scope.demoMaskFiles = $scope.session.config.qxdm.selectedMaskFile;
        $scope.packets = $scope.session.config.qxdm.packets || '';
        break;
      case 'video':
        $scope.frameRate = $scope.session.config.video.frameRate || '15'; 
        break;
      case 'logcatLogs':
        
        break;
      case 'bugreport':
        $scope.session.config.bugreportAction = $scope.bugreportAction  || 'continue';
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
      case 'qxdm':
        if ($scope.session.config.qxdm.qxdmOption === 'maskFile') {
          $scope.session.config.qxdm.maskFile = $scope.selectedMaskFile;
        } else {
          $scope.session.config.qxdm.packets = $scope.session.config.qxdm.packets;
        }
        break;
      case 'video':
          $scope.session.config.video = {
          frameRate: $scope.frameRate,
          visible: true
        };
        break;
      case 'logcatLogs':
        $scope.session.config.logcatLogs.visible = true;
        break;
      case 'bugreport':
        $scope.bugreportAction = $scope.session.config.bugreportAction  ;
        console.log($scope.bugreportAction,"QWERTYUIOUYTRFDESASDFGHJKLJHGFDSASDFGHJK")
        $scope.session.config.bugreportAction.visible = true;
        console.log("BUGREPORT IS SAVED")
        break;
      case 'audio':
        $scope.session.config.audio.visible = true;
        break;
    }
 
    alert('Customization saved successfully!');
  };
  
  $scope.clearCustomization = function() {
    switch($scope.logtype) {
      case 'qxdm':
        $scope.session.config.qxdm = {
          maskFile: null,
          packets: '',
          qxdmOption: 'maskFile', // Reset to default option
          selectedMaskFile: $scope.maskFiles[0] // Reset to first mask file option
        };
        break;
      case 'video':
        $scope.frameRate = '15';
        $scope.session.config.video = {
          frameRate: '15',
          visible: false
        };
        break;
      case 'logcatLogs':
        
        break;
      case 'bugreport':
        $scope.session.config.bugreportAction = 'continue';
        $scope.bugreportAction='continue';
       // $scope.session.bugreportAction = {
          //bugreportAction: 'continue',
          //visible: false
        //};
        break;
      case 'audio':
        
        break;
    }
 
    alert('Customization cleared successfully!');
    $scope.initializeSession();
  };
  
  $scope.clearCustomization_1 = function()
  {
    console.log("clearing all the data")
    
    $scope.session.testCaseID="";
    console.log("clearing all the data",$scope.session.testCaseID)
    
    $scope.session.description="";
    
    $scope.initializeSession();
    $scope.selectedMaskFile = $scope.maskFiles[0];
    $scope.packets = '';
    $scope.session.qxdm = {
      maskFile: null,
      packets: '',
      visible: false
  }
}
  
  $scope.toggleStartStop = function() {
    $scope.isRunning = !$scope.isRunning;
    $scope.isViewing = true;
    
    if (!$scope.isRunning) {
      $scope.checkboxes = {
        logcatLogs: false,
        bugreportAction: false,
        qxdm: false,
        video: false,
        audio: false
      };
      $scope.stopTestAssist()
      //window.location.reload();}
     // $scope.showCustomizeButton = {};
    
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
   $scope.qxdmCapable=$scope.device.qxdm && $scope.device.qxdm.capability || false
   // $scope.getTestAssistHistory()
     // .then(getTestAssistStatus)
      /* .then(async function (device) {
        
        $scope.maskFiles.push(...device.qxdm.maskFiles || [])
        console.log($scope.maskFiles)
      })
        .catch(function (err) {
        $scope.error = err
      }).finally(function () {
        $scope.allPending = false
      }) */
      console.log($scope.device,"console ke bahar wala hun mein")
      
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

  $scope.getTestAssistHistory = function() {
    $scope.showHistory=!$scope.showHistory
    if(!$scope.showHistory){
    
    return $http.get(`/api/v1/devices/session/${serial}/history?isUi=true`).then(function (response) {
      $scope.history = response.data.history.map(newTC => {
        const oldTC = $scope.history.find((oldTC) => oldTC.executionID === newTC.executionID)
        if (oldTC && oldTC.isUploading) {
          return oldTC
        } else {
         /*  newTC.config=newTC.config || [];
          newTC.config.selectedLogs = newTC.config.selectedLogs || []; */
          return newTC
        }
      })
      console.log($scope.history,"****************************************")
    }).catch(function (error) {
      console.error("Error fetching test assist history" + error)
    })
  }
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
  
 /*  $scope.selectMaskFile = function (maskFile) 
  {
    $scope.selectedMaskFile = maskFile
        
  
  } */
 
  $scope.startTestAssist = function() {
    if ($scope.session.testCaseID) {
      console.log("description", $scope.session.description);
      console.log($scope.session.config.bugreportAction,"asdfghjkl")
   
      
      var logs = {};
      if ($scope.checkboxes.logcatLogs) logs.logcatLogs = $scope.session.config.logcatLogs;
      if ($scope.checkboxes.bugreport) logs.bugreport = $scope.session.config.bugreportAction;
      if ($scope.checkboxes.qxdm) logs.qxdm = $scope.demoMaskFiles;
      if ($scope.checkboxes.video) logs.video = $scope.session.config.video;
      if ($scope.checkboxes.audio) logs.audio = $scope.session.config.audio;
   
     
      var testData = {
        testCaseID: $scope.session.testCaseID,
        description: $scope.session.description,
        config: logs,
        /* logs: logs */
      };
   
      console.log("Starting Test Assist with data:", testData);
   
      
      $scope.control.startTestAssist(testData)
        .then(function(result) {
          $scope.isRunning = true;
          console.log(result.body, "result is coming in the body...");
          
   
          if (result.body) {
            getTestAssistStatus();
         // $sope.session = result.body;
   
            if (result.body.bugreports && result.body.bugreports.status === "discarding") {
              $scope.bugreportData.status = 'discarding';
              console.log(result.body, "Bugreport status updated");
            }
            console.log(result.body, "Session started");
          }
        })
        .catch(function(err) {
          console.error(`Error starting test execution: ${err.message}`);
        })
        .finally(function() {
          console.log("Execution finished.");
          $scope.pending = false;
        });
    }
  };
  
      $scope.stopTestAssist = function () {
        console.log("STOPPED")
        $scope.showCustomizeButton = {};
        $scope.updateCustomizeButton();
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
            return $scope.getTestAssistHistory();
          })
          .catch(function (err) {
            console.error(`Error stopping test execution: ${err.message}`);
          }).finally(function () {
            $scope.isRunning = false;
            
            $scope.optInBugreport = false;
          });
      };
      
      $scope.updateBugreportAction = function() {
        console.log("Bug report action selected:", $scope.session.config.bugreportAction);
        
      }

  /* $scope.startBugreportCapture = function () {
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
  } */

  $scope.captureScreenshot = function () {
    $scope.isCapturingScreenshot = true
    $scope.control.testAssistCaptureScreenshot()
      .then(function (result) {
        $scope.screenshots = result.body
        $scope.screenshots = $scope.screenshots.reverse();
        console.log($scope.screenshots,"REDTFYUGIKYJHGYFCNVH,k")
      }).catch(function (err) {
        console.log(`Error capturing screenshot: ${err.message}`)
      })
      .finally(() => {
        $scope.isCapturingScreenshot = false
       console.log("Screenshots taken")
      })
      storeScreenshots();
  }
  
  var storeScreenshots = function() {
    sessionStorage.setItem(cachedPath, JSON.stringify($scope.screenshots))
  }

  
  $scope.downloadScreenshot = function (screenshot) {
    var screenshotName = `${screenshot.tempPath.id}/${screenshot.tempPath.name}`

    $http.get(`s/image/${screenshotName}`, {
      responseType: "arraybuffer"
    })
      .success(function (data) {
        var anchor = angular.element('<a/>');
        var blob = new Blob([data]);
        anchor.attr({
          href: window.URL.createObjectURL(blob),
          target: '_blank',
          download: `${screenshotName}.jpg`
        })[0].click();
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
        return $scope.getTestAssistHistory()
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
      return $scope.getTestAssistHistory()
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
