module.exports = function BluetoothModulesCtrl($scope, SettingsService) {
  $scope.bluetoothModules = [];
  $scope.newModule = {};
  $scope.showGenerate = false; 
  $scope.showGenerated = false;
 
  function updateModules() {
    const modules = SettingsService.get('bluetoothModules');
    $scope.bluetoothModules = modules ? modules : [];
  }
 
  $scope.removeModule = function(name) {
    console.log("delete hoja bhai")
    const modules = SettingsService.get('bluetoothModules') || [];
    const updatedModules = modules.filter(module => module.name !== name);
    SettingsService.set('bluetoothModules', updatedModules);
    updateModules(); 
  };
 
  $scope.closeGenerated = function() {
    $scope.showGenerated = false;
    $scope.newModule = {};
    updateModules();
  };
 
  $scope.addModule = function() {
    if ($scope.bluetoothForm.$valid) {
      const modules = SettingsService.get('bluetoothModules') || [];
      modules.push($scope.newModule);
      SettingsService.set('bluetoothModules', modules);
      $scope.newModule = {};
      $scope.showGenerate = false;
      updateModules();
    }
  };
 
  $scope.toggleGenerate = function() {
    $scope.showGenerate = !$scope.showGenerate;
  };
 
  $scope.$on('user.keys.bluetoothModules.generated', function(event, module) {
    $scope.newModule = module;
    $scope.showGenerated = true;
  });
 
  $scope.$on('user.keys.bluetoothModules.updated', updateModules);
 
  updateModules();
};
