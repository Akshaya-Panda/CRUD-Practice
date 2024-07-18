module.exports = function BluetoothModulesCtrl($scope, BluetoothModuleService) {
  $scope.bluetoothModules = [];
  $scope.newModule = {};
  $scope.showGenerate = false; // Initially set to false
  $scope.showGenerated = false;
 
  function updateModules() {
    BluetoothModuleService.getFullBluetoothModules()
      .then(function(response) {
        $scope.bluetoothModules = response.data.modules || [];
      });
  }
 
  $scope.removeModule = function(name) {
    BluetoothModuleService.removeBluetoothModule(name)
      .then(updateModules); // Ensure the list updates after removal
  };
 
  $scope.closeGenerated = function() {
    $scope.showGenerated = false;
    $scope.newModule = {};
    updateModules();
  };
 
  $scope.addModule = function() {
    if ($scope.bluetoothForm.$valid) {
      BluetoothModuleService.addBluetoothModule($scope.newModule)
        .then(function() {
          $scope.newModule = {};
          $scope.showGenerate = false;
          updateModules();
        });
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
