
module.exports = function AccessTokensCtrl($scope, AccessTokenService) {

    $scope.accessTokens = []
    $scope.newToken = null

    function updateTokens() {
      AccessTokenService.getFullAccessTokens()
        .success(function(response) {
          $scope.accessTokens = response.tokens || []
        })
    }

    $scope.removeToken = function(title) {
      AccessTokenService.removeAccessToken(title)
    }

    $scope.closeGenerated = function() {
      $scope.showGenerated = false
      $scope.newToken = null
      updateTokens()
    }

    $scope.$on('user.keys.accessTokens.generated', function(event, token) {
      $scope.newToken = token
      $scope.showGenerated = true
    })

    $scope.$on('user.keys.accessTokens.updated', updateTokens)

    updateTokens()
}
