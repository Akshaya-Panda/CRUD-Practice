module.exports = function BluetoothModulesCtrl($scope, SettingsService) {
  $scope.bluetoothModules = [];
  $scope.newModule = {};
  $scope.showGenerate = false;
  $scope.showGenerated = false;
  $scope.editModule = false;
 
  function updateModules() {
    
    const modules = SettingsService.get('bluetoothModules');
    $scope.bluetoothModules = modules ? modules : [];
  }
 
  $scope.removeModule = function(name) {
    console.log("Deleting module:", name);
    const modules = SettingsService.get('bluetoothModules') || [];
    const updatedModules = modules.filter(module => module.name !== name);
    SettingsService.set('bluetoothModules', updatedModules);
    updateModules();
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
      const modules = SettingsService.get('bluetoothModules') || [];
      if ($scope.editModule) {
        
        const index = modules.findIndex(m => m.name === $scope.newModule.name);
        
        if (index !== -1) {
          
          modules[index] = $scope.newModule;
        }
        
        
      } else {
        modules.push($scope.newModule);
      }
      SettingsService.set('bluetoothModules', modules);
      $scope.newModule = {};
      $scope.showGenerate = false;
      $scope.editModule = false;
      updateModules();
    }
  };
 
  $scope.toggleGenerate = function() {
    $scope.showGenerate = !$scope.showGenerate;
    $scope.editModule = false;
    $scope.newModule = {};
  };
 
  $scope.$on('user.keys.bluetoothModules.generated', function(event, module) {
    $scope.newModule = module;
    $scope.showGenerated = true;
  });
 
  $scope.$on('user.keys.bluetoothModules.updated', updateModules);
 
  updateModules();
};
