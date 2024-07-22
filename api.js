const dbapi = require('../../../db/api')
const _ = require('lodash')
const apiutil = require('../../../util/apiutil')
const lockutil = require('../../../util/lockutil')
const Promise = require('bluebird')
const wire = require('../../../wire')
const wireutil = require('../../../wire/util')
const userapi = require('./user')
function getUserByEmail(req, res) {
  const email = req.swagger.params.email.value

  getUserInfo(req, email).then(function(user) {
    if (user) {
      apiutil.respond(res, 200, 'User Information', {user: user})
    }
    else {
      apiutil.respond(res, 404, 'Not Found (user)')
    }
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to get user: ', err.stack)
  })
}

function getUsers(req, res) {
  const fields = req.swagger.params.fields.value

  dbapi.getUsers().then(function(users) {
    return dbapi.getRootGroup().then(function(group) {
      apiutil.respond(res, 200, 'Users Information', {
        users: users.map(function(user) {
          return getPublishedUser(user, req.user.email, group.owner.email, fields)
        })
      })
    })
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to get users: ', err.stack)
  })
}

function createUser(req, res) {
  const email = req.swagger.params.email.value
  const name = req.swagger.params.name.value

  dbapi.createUser(email, name, req.user.ip).then(function(stats) {
    if (!stats.inserted) {
      apiutil.respond(res, 403, 'Forbidden (user already exists)')
    }
    else {
      apiutil.respond(res, 201, 'Created (user)', {
        user: apiutil.publishUser(stats.changes[0].new_val)
      })
    }
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to create user: ', err.stack)
  })
}

function deleteUsers(req, res) {
  const emails = apiutil.getBodyParameter(req.body, 'emails')
  const target = apiutil.getQueryParameter(req.swagger.params.redirected) ? 'user' : 'users'

  function removeUsers(emails) {
    let results = []

    return Promise.each(emails, function(email) {
      return removeUser(email, req, res).then(function(result) {
        results.push(result)
      })
    })
    .then(function() {
      results = _.without(results, 'unchanged')
      if (!results.length) {
        return apiutil.respond(res, 200, `Unchanged (${target})`)
      }
      results = _.without(results, 'not found')
      if (!results.length) {
        return apiutil.respond(res, 404, `Not Found (${target})`)
      }
      results = _.without(results, 'forbidden')
      if (!results.length) {
        apiutil.respond(res, 403, `Forbidden (${target})`)
      }
      return apiutil.respond(res, 200, `Deleted (${target})`)
    })
    .catch(function(err) {
      if (err !== 'busy') {
        throw err
      }
    })
  }

  (function() {
    if (typeof emails === 'undefined') {
      return dbapi.getEmails().then(function(emails) {
        return removeUsers(emails)
      })
    }
    else {
      return removeUsers(_.without(emails.split(','), ''))
    }
  })()
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to delete ${target}: ', err.stack)
  })
}

function deleteUser(req, res) {
  apiutil.redirectApiWrapper('email', deleteUsers, req, res)
}

function createUserAccessToken(req, res) {
  userApiWrapper(userapi.createAccessToken, req, res)
}

function deleteUserAccessToken(req, res) {
  userApiWrapper(userapi.deleteAccessToken, req, res)
}

function deleteUserAccessTokens(req, res) {
  userApiWrapper(userapi.deleteAccessTokens, req, res)
}

function getUserAccessToken(req, res) {
  userApiWrapper(userapi.getAccessToken, req, res)
}

function getUserAccessTokens(req, res) {
  userApiWrapper(userapi.getAccessTokens, req, res)
}

function getUserDevices(req, res) {
  userApiWrapper(userapi.getUserDevices, req, res)
}

function getUserDevice(req, res) {
  userApiWrapper(userapi.getUserDeviceBySerial, req, res)
}

function addUserDevice(req, res) {
  userApiWrapper(userapi.addUserDevice, req, res)
}

function deleteUserDevice(req, res) {
  userApiWrapper(userapi.deleteUserDeviceBySerial, req, res)
}

function remoteConnectUserDevice(req, res) {
  userApiWrapper(userapi.remoteConnectUserDeviceBySerial, req, res)
}

function remoteDisconnectUserDevice(req, res) {
  userApiWrapper(userapi.remoteDisconnectUserDeviceBySerial, req, res)
}

function updateUserPrivilege(req,res) {
  userApiWrapper(userapi.updateUserPrivilege, req, res)
}


module.exports = {
    updateUserGroupsQuotas: updateUserGroupsQuotas
  , updateDefaultUserGroupsQuotas: updateDefaultUserGroupsQuotas
  , getUsers: getUsers
  , getUserByEmail: getUserByEmail
  , getUserInfo: getUserInfo
  , createUser: createUser
  , deleteUser: deleteUser
  , deleteUsers: deleteUsers
  , createUserAccessToken: createUserAccessToken
  , deleteUserAccessToken: deleteUserAccessToken
  , deleteUserAccessTokens: deleteUserAccessTokens
  , getUserAccessTokensV2: getUserAccessTokens
  , getUserAccessToken: getUserAccessToken
  , getUserDevicesV2: getUserDevices
  , getUserDevice: getUserDevice
  , addUserDeviceV3: addUserDevice
  , deleteUserDevice: deleteUserDevice
  , remoteConnectUserDevice: remoteConnectUserDevice
  , remoteDisconnectUserDevice: remoteDisconnectUserDevice 
  , updateUserPrivilege: updateUserPrivilege
}
