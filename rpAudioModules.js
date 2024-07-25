const util = require('util');
const _ = require('lodash');
const Promise = require('bluebird');
const uuid = require('uuid');
const dbapi = require('../../../db/api');
const logger = require('../../../util/logger');
const wire = require('../../../wire');
const wireutil = require('../../../wire/util');
const apiutil = require('../../../util/apiutil');


 
const log = logger.createLogger('api:controllers:rpAudioModules');
 
module.exports = {
  getModules:getModules,
  getModuleById:getModuleById,
  addModule:addModule,
  updateModule:updateModule,
  deleteModule:deleteModule
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
 
  dbapi.loadModule (id).then(module => {
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
 function addModule(req, res) {
  const module = req.body;
  module.createdBy = req.user.email;
  module.updatedBy = req.user.email;
 
  dbapi.insertRpAudioModule(module).then(() => {
    res.json({ success: true });
  }).catch(err => {
    apiutil.internalError(res, 'Failed to add module: ', err.stack);
  });
}
 
function updateModule(req, res) {
  const module = req.body;
  const id = req.swagger.params.id.value;
  module.updatedBy = req.user.email;
 
  dbapi.updateRpAudioModule(id, module).then(stats => {
    if (stats.replaced) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: 'Module not found' });
    }
  }).catch(err => {
    apiutil.internalError(res, 'Failed to update module: ', err.stack);
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
