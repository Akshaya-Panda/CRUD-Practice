const sharp = require('sharp')
var Promise = require('bluebird')
 
module.exports = function(stream, options) {
  return new Promise(function(resolve, reject) {
    try {
      const transform = sharp()
 
      // 'gravity' not used anywhere right now, it is the alignment of the image inside the bounds after transformations have been applied
      // if (options.gravity) {
      //   transform.gravity(options.gravity)
      // }
     
      if (options.crop) {
        transform.resize(options.crop.width, options.crop.height, {
          fit: 'inside'
        })
      }
     
      return resolve(stream.pipe(transform))
    } catch (err) {
      console.log(err)
      reject(err)
    }
  })
}
