module.exports = function BluetoothModulesCtrl($scope, SettingsService, $http) {
  $scope.bluetoothModules = [];
  $scope.newModule = {};
  $scope.showGenerate = false;
  $scope.showGenerated = false;
  $scope.editModule = false;
 
  // function updateModules() {
    
  //   const modules = SettingsService.get('bluetoothModules');
  //   $scope.bluetoothModules = modules ? modules : [];
  // }

  // function updateModules() {
  //   SettingsService.getBluetoothModules().then(data => {
  //     $scope.bluetoothModules = data.modules || [];
  //   }).catch(error => {
  //     console.error('Failed to fetch modules:', error);
  //   });
  // }

  function updateModules() {
    $http.get('/api/v1/rpAudioModules') 
      .then(response => {
        console.log(response.data.modules._responses[0]['r'])
        $scope.bluetoothModules =response.data.modules._responses[0]['r']? response.data.modules._responses[0]['r'] : [];
      })
      .catch(error => {
        console.error('Failed to load modules:', error);
      });
  }

 
  // $scope.removeModule = function(name) {
  //   console.log("Deleting module:", name);
  //   const modules = SettingsService.get('bluetoothModules') || [];
  //   const updatedModules = modules.filter(module => module.name !== name);
  //   SettingsService.set('bluetoothModules', updatedModules);
  //   updateModules();
  // };

  $scope.removeModule = function(id) {
    $http.delete(`/api/v1/rpAudioModules/${id}`)
      .then(() => {
        updateModules();
      })
      .catch(error => {
        console.error('Failed to delete module:', error);
      });
  };
 
  $scope.editModuleDetails = function(module) {
    $scope.newModule = angular.copy(module);
    $scope.editModule = true;
    $scope.showGenerate = true;
  };
 
  $scope.closeGenerated = function() {
    $scope.showGenerated = false;
    $scope.newModule = {};
    updateModules();
  };
 
  $scope.addOrUpdateModule = function() {
    if ($scope.bluetoothForm.$valid) {
      const url = $scope.editModule ?
`/api/v1/rpAudioModules/${$scope.newModule.id}` :
        '/api/v1/rpAudioModules';
      console.log(url,"qwertgdsdfg")
       const method = $scope.editModule ? 'PUT' : 'POST';
 
      $http({
        method: method,
        url: url,
        data: $scope.newModule
      })
      .then(() => {
        $scope.newModule = {};
        $scope.showGenerate = false;
        $scope.editModule = false;
        updateModules();
      })
      .catch(error => {
        console.error('Failed to add/update module:', error);
      });
    }
  };

  // $scope.addOrUpdateModule = function() {
    
  //   if ($scope.bluetoothForm.$valid) {
  //     const modules = SettingsService.get('bluetoothModules') || [];
  //     if ($scope.editModule) {
        
  //       const index = modules.findIndex(m => m.name === $scope.newModule.name);
        
  //       if (index !== -1) {
          
  //         modules[index] = $scope.newModule;
  //       }
        
        
  //     } else {
  //       modules.push($scope.newModule);
  //     }
  //     SettingsService.set('bluetoothModules', modules);
  //     $scope.newModule = {};
  //     $scope.showGenerate = false;
  //     $scope.editModule = false;
  //     updateModules();
  //   }
  // };
 
  $scope.toggleGenerate = function() {
    $scope.showGenerate = !$scope.showGenerate;
    $scope.editModule = false;
    $scope.newModule = {};
  };
 
  $scope.$on('user.general.bluetoothModules.generated', function(event, module) {
    $scope.newModule = module;
    $scope.showGenerated = true;
  });
 
  $scope.$on('user.general.bluetoothModules.updated', updateModules);
 
  updateModules();
};
