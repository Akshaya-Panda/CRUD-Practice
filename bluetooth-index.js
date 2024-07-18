require('./bluetooth-module.css')
 
module.exports = angular.module('stf.settings.general.bluetooth-modules', [
    require('stf/settings').name
])
  .run(['$templateCache', function($templateCache) {
    $templateCache.put(
      'settings/general/bluetooth-module/bluetooth-module.pug', require('./bluetooth-module.pug')
    )
  }])
  .controller('BluetoothModulesCtrl', require('./bluetooth-module-controller'))
