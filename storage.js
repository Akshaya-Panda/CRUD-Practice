var util = require('util')
var url = require('url')

var syrup = require('@devicefarmer/stf-syrup')
var Promise = require('bluebird')
var request = require('request')

var logger = require('../../../util/logger')

module.exports = syrup.serial()
  .define(function(options) {
    var log = logger.createLogger('device:support:storage')
    var plugin = Object.create(null)

    plugin.store = function(type, stream, meta) {
      var resolver = Promise.defer()
      var args = {
        strictSSL: false,
        rejectUnauthorized: false,
        url: url.resolve(options.storageUrl, util.format('s/upload/%s', type))
      }

      var req = request.post(args, function(err, res, body) {
        if (err) {
          console.log("111111111111144444444444444444444444444444")
          log.error('Upload to "%s" failed', args.url, err.stack)
          resolver.reject(err)
        }
        else if (res.statusCode !== 201) {
          console.log("1111111111111444444444444444444444444444445555555555555555555555")
          log.error('Upload to "%s" failed: HTTP %d', args.url, res.statusCode)
          resolver.reject(new Error(util.format(
            'Upload to "%s" failed: HTTP %d'
          , args.url
          , res.statusCode
          )))
        }
        else {
          try {
            console.log('90909090909090909090090909090909090990909090900909');
            var result = JSON.parse(body)
            log.info('Uploaded to "%s"', result.resources.file.href)
            resolver.resolve(result.resources.file)
          }
          catch (err) {
            console.log('()()()()()()()()()()()()()()()()(()())[[][][][[][[[][][[]]]]]])');
            log.error('Invalid JSON in response', err.stack, body)
            resolver.reject(err)
          }
        }
      })

      req.form()
        .append('file', stream, meta)

      return resolver.promise
    }

    return plugin
  })
