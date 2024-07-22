function getUserAccessTokens(req, res) {
  dbapi.loadAccessTokens(req.user.email)
    .then(function(cursor) {
      return Promise.promisify(cursor.toArray, cursor)()
        .then(function(list) {
          var titles = []
          list.forEach(function(token) {
            titles.push(token.title)
          })
          res.json({
            success: true
          , titles: titles
          })
        })
    })
    .catch(function(err) {
      log.error('Failed to load tokens: ', err.stack)
      res.status(500).json({
        success: false
      })
    })
}

function addAdbPublicKey(req, res) {
  var data = req.swagger.params.adb.value
  adbkit.util.parsePublicKey(data.publickey)
    .then(function(key) {
      return dbapi.lookupUsersByAdbKey(key.fingerprint)
        .then(function(cursor) {
          return cursor.toArray()
        })
        .then(function(users) {
          return {
            key: {
              title: data.title || key.comment
            , fingerprint: key.fingerprint
            }
          , users: users
          }
        })
    })
    .then(function(data) {
      if (data.users.length) {
        return res.json({
          success: true
        })
      }
      else {
        return dbapi.insertUserAdbKey(req.user.email, data.key)
          .then(function() {
            return res.json({
              success: true
            })
          })
      }
    })
    .then(function() {
      req.options.push.send([
        req.user.group
      , wireutil.envelope(new wire.AdbKeysUpdatedMessage())
      ])
    })
    .catch(dbapi.DuplicateSecondaryIndexError, function() {
      // No-op
      return res.json({
        success: true
      })
    }).catch(function(err) {
      log.error('Failed to insert new adb key fingerprint: ', err.stack)
      return res.status(500).json({
        success: false
      , message: 'Unable to insert new adb key fingerprint to database'
      })
    })
}

function getAccessToken(req, res) {
  const id = req.swagger.params.id.value

  dbapi.loadAccessToken(id).then(function(token) {
    if (!token || token.email !== req.user.email) {
      apiutil.respond(res, 404, 'Not Found (access token)')
    }
    else {
      apiutil.respond(res, 200, 'Access Token Information', {
        token: apiutil.publishAccessToken(token)
      })
    }
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to delete access token "%s": ', id, err.stack)
  })
}

function getAccessTokens(req, res) {
  dbapi.loadAccessTokens(req.user.email).then(function(cursor) {
    Promise.promisify(cursor.toArray, cursor)().then(function(tokens) {
      const tokenList = []

      tokens.forEach(function(token) {
        tokenList.push(apiutil.publishAccessToken(token))
      })
      apiutil.respond(res, 200, 'Access Tokens Information', {tokens: tokenList})
    })
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to get access tokens: ', err.stack)
  })
}

function createAccessToken(req, res) {
  const title = req.swagger.params.title.value
  const jwt = jwtutil.encode({
    payload: {
      email: req.user.email
    , name: req.user.name
    }
  , secret: req.options.secret
  })
  const id = util.format('%s-%s', uuid.v4(), uuid.v4()).replace(/-/g, '')

  dbapi.saveUserAccessToken(req.user.email, {
    title: title
  , id: id
  , jwt: jwt
  })
  .then(function(stats) {
    req.options.pushdev.send([
      req.user.group
    , wireutil.envelope(new wire.UpdateAccessTokenMessage())
    ])
    apiutil.respond(res, 201, 'Created (access token)',
      {token: apiutil.publishAccessToken(stats.changes[0].new_val)})
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to create access token "%s": ', title, err.stack)
  })
}

function deleteAccessTokens(req, res) {
  dbapi.removeUserAccessTokens(req.user.email).then(function(stats) {
    if (!stats.deleted) {
     apiutil.respond(res, 200, 'Unchanged (access tokens)')
    }
    else {
      req.options.pushdev.send([
        req.user.group
      , wireutil.envelope(new wire.UpdateAccessTokenMessage())
      ])
      apiutil.respond(res, 200, 'Deleted (access tokens)')
    }
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to delete access tokens: ', err.stack)
  })
}

function deleteAccessToken(req, res) {
  const id = req.swagger.params.id.value

  dbapi.loadAccessToken(id).then(function(token) {
    if (!token || token.email !== req.user.email) {
      apiutil.respond(res, 404, 'Not Found (access token)')
    }
    else {
      dbapi.removeAccessToken(id).then(function(stats) {
        if (!stats.deleted) {
          apiutil.respond(res, 404, 'Not Found (access token)')
        }
        else {
          req.options.pushdev.send([
            req.user.group
          , wireutil.envelope(new wire.UpdateAccessTokenMessage())
          ])
          apiutil.respond(res, 200, 'Deleted (access token)')
        }
      })
    }
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to delete access token "%s": ', id, err.stack)
  })
}
