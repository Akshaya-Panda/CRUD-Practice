function getUserInfo(req, email) {
  const fields = req.swagger.params.fields.value

  return dbapi.loadUser(email).then(function(user) {
    if (user) {
      return dbapi.getRootGroup().then(function(group) {
        return getPublishedUser(user, req.user.email, group.owner.email, fields)
      })
    }
    return false
  })
}

function updateUserGroupsQuotas(req, res) {
  const email = req.swagger.params.email.value
  const duration =
    typeof req.swagger.params.duration.value !== 'undefined' ?
      req.swagger.params.duration.value :
      null
  const number =
    typeof req.swagger.params.number.value !== 'undefined' ?
      req.swagger.params.number.value :
      null
  const repetitions =
    typeof req.swagger.params.repetitions.value !== 'undefined' ?
      req.swagger.params.repetitions.value :
      null
  const lock = {}

  lockutil.lockUser(email, res, lock).then(function(lockingSuccessed) {
    if (lockingSuccessed) {
      return dbapi.updateUserGroupsQuotas(email, duration, number, repetitions)
        .then(function(stats) {
          if (stats.replaced) {
            return apiutil.respond(res, 200, 'Updated (user quotas)', {
              user: apiutil.publishUser(stats.changes[0].new_val)
            })
          }
          if ((duration === null || duration === lock.user.groups.quotas.allocated.duration) &&
              (number === null || number === lock.user.groups.quotas.allocated.number) &&
              (repetitions === null || repetitions === lock.user.groups.quotas.repetitions)
             ) {
            return apiutil.respond(res, 200, 'Unchanged (user quotas)', {user: {}})
          }
          return apiutil.respond(
            res
          , 400
          , 'Bad Request (quotas must be >= actual consumed resources)')
        })
    }
    return false
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to update user groups quotas: ', err.stack)
  })
  .finally(function() {
    lockutil.unlockUser(lock)
  })
}

function updateDefaultUserGroupsQuotas(req, res) {
  const duration =
    typeof req.swagger.params.duration.value !== 'undefined' ?
      req.swagger.params.duration.value :
      null
  const number =
    typeof req.swagger.params.number.value !== 'undefined' ?
      req.swagger.params.number.value :
      null
  const repetitions =
    typeof req.swagger.params.repetitions.value !== 'undefined' ?
      req.swagger.params.repetitions.value :
      null
  const lock = {}

  lockutil.lockUser(req.user.email, res, lock).then(function(lockingSuccessed) {
    if (lockingSuccessed) {
      return dbapi.updateDefaultUserGroupsQuotas(req.user.email, duration, number, repetitions)
        .then(function(stats) {
          if (stats.replaced) {
            return apiutil.respond(res, 200, 'Updated (user default quotas)', {
              user: apiutil.publishUser(stats.changes[0].new_val)
            })
          }
          return apiutil.respond(res, 200, 'Unchanged (user default quotas)', {user: {}})
        })
    }
    return false
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to update default user groups quotas: ', err.stack)
  })
  .finally(function() {
    lockutil.unlockUser(lock)
  })
}

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
