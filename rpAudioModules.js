const util = require('util');
const _ = require('lodash');
const Promise = require('bluebird');
const uuid = require('uuid');
const dbapi = require('../../../db/api');
const logger = require('../../../util/logger');
const wire = require('../../../wire');
const wireutil = require('../../../wire/util');
const apiutil = require('../../../util/apiutil');
const request = require('request');
 
const log = logger.createLogger('api:controllers:rpAudioModules');
module.exports = {
  getModules: getModules,
  getModuleById: getModuleById,
  addModule: addModule,
  updateModule: updateModule,
  deleteModule: deleteModule,
  validateIpPort: validateIpPort
};
function getModules(req, res) {
  dbapi.loadModules().then(modules => {
    res.json({
      success: true,
      modules
    });
  }).catch(err => {
    apiutil.internalError(res, 'Failed to load modules: ', err.stack);
  });
}
function getModuleById(req, res) {
const id = req.swagger.params.id.value;
  dbapi.loadModule(id).then(module => {
    if (module) {
      res.json({
        success: true,
        module
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Module not found'
      });
    }
  }).catch(err => {
    apiutil.internalError(res, 'Failed to get module: ', err.stack);
  });
}
 
function validateIpPort(localip, port, subroute) {
  const url = `https://tm-reddemo11.oasisofsolution.com/api/v1/rpAudioModules/${localip}:${port}`;
  const options = {
    method: 'GET',
    url: url,
    headers: {}
  };
 
  return new Promise((resolve, reject) => {
    request(options, (error, response) => {
      if (error) {
        return reject(new Error(`Failed to reach ${url}: ${error.message}`));
      }
      if (response.statusCode === 200) {
        dbapi.checkFields(localip, port, subroute).then(isUnique => {
          if (!isUnique) {
            return reject(new Error('Local IP, port, or subroute already exists'));
          }
          resolve(true);
        }).catch(reject);
      } else {
        reject(new Error('Invalid IP/Port combination'));
      }
    });
  });
}
 
function validateModule(module) {
  const subroutePattern = /^\/[^/]*\/$/;
  if (!subroutePattern.test(module.subroute)) {
    throw new Error('Subroute should start with a forward slash and end with a backward slash');
  }
 
  return dbapi.checkFields(module.localip, module.port, module.subroute);
}
 
function addModule(req, res) {
  const module = req.body;
module.createdBy = req.user.email;
module.updatedBy = req.user.email;
  validateModule(module).then(() => {
    return dbapi.insertRpAudioModule(module);
  }).then(() => {
    res.json({ success: true });
  }).catch(err => {
    if (err.message === 'Subroute, localip, or port already exists') {
      res.status(400).json({ success: false, message: err.message });
    } else {
      apiutil.internalError(res, 'Failed to add module: ', err.stack);
    }
  });
}
 
function updateModule(req, res) {
  const module = req.body;
const id = req.swagger.params.id.value;
module.updatedBy = req.user.email;
 
  validateModule(module).then(() => {
    return dbapi.updateRpAudioModule(id, module);
  }).then(stats => {
    if (stats.replaced) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: 'Module not found' });
    }
  }).catch(err => {
    if (err.message === 'Subroute, localip, or port already exists') {
      res.status(400).json({ success: false, message: err.message });
    } else {
      apiutil.internalError(res, 'Failed to update module: ', err.stack);
    }
  });
}
 
function deleteModule(req, res) {
const id = req.swagger.params.id.value;
  dbapi.removeModule(id).then(stats => {
    if (stats.deleted) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: 'Module not found' });
    }
  }).catch(err => {
    apiutil.internalError(res, 'Failed to delete module: ', err.stack);
  });
}
