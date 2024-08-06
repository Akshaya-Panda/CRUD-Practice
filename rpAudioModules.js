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
const nginxutil = require('../../../util/nginxutil'); 

const log = logger.createLogger('api:controllers:rpAudioModules');
module.exports = {
  getModules: getModules,
  getModuleById: getModuleById,
  addModule: addModule,
  updateModule: updateModule,
  deleteModule: deleteModule,
  //validateIpPort: validateIpPort,
  validateModule: validateModule
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
 
// function validateIpPort(localip, port, subroute) {
//   const url = `http://${localip}:${port}`;
//   const options = {
//     method: 'GET',
//     url: url,
//     headers: {}
//   };
 
//   return new Promise((resolve, reject) => {
//     request(options, (error, response) => {
//       if (error) {
//         return reject(new Error(`Failed to reach ${url}: ${error.message}`));
//       }
//       if (response.statusCode === 200) {
//         dbapi.checkFields(localip, port, subroute).then(isUnique => {
//           if (!isUnique) {
//             return reject(new Error('Local IP, port, or subroute already exists'));
//           }
//           resolve(true);
//         }).catch(reject);
//       } else {
//         reject(new Error('Invalid IP/Port combination'));
//       }
//     });
//   });
// }
 
function validateModule(module) {
  const subroutePattern = /^\/[^/]*\/$/;
  if (!subroutePattern.test(module.subroute)) {
    throw new Error('Subroute should start with a forward slash and end with a backward slash');
  }
 
  //return dbapi.checkFields(module.localip, module.port, module.subroute);
}
 
async function addModule(req, res) {
const module = req.body;
module.createdBy = req.user.email;
module.updatedBy = req.user.email;
//   validateModule(module)
//   .then(() => { validateIpPort(module.localip,module.port,module.subroute)})
//   .then(()=>{
//     return dbapi.insertRpAudioModule(module);
//   }).then(() => {
//     return dbapi.updateNginxConfig();
//   }).then(()=>{
//     res.json({ success: true });
//   }).catch(err => {
//     if (err.message === 'Subroute, localip, or port already exists') {
//       res.status(400).json({ success: false, message: err.message });
//     } else {
//       apiutil.internalError(res, 'Failed to add module: ', err.stack);
//     }
//   });
  try {
    validateModule(module);
    const allModules = await dbapi.loadModules();
    //console.log(allModules)
    if( nginxutil.validateAndUpdateNginxConfig(allModules, module)){
    // if nginx update is successful add to database.
     dbapi.insertRpAudioModule(module);
    
    res.json({success: true, module});
    }
  }catch(err){
    if(err.message === 'Local IP , Port or Subroute already exists' ||
       err.message === "Failed to reach the specified IP and Port" ||
       err.message === "Nginx configuration test failed" ||
       err.message === "Failed to Reload Nginx"
    ) {
      res.status(400).json({ success:false, message: err.message});
    }else {
        apiutil.internalError(res, 'Failed to add module: ', err.stack);
      }

  }
 }
async function updateModule(req, res) {
  const module = req.body; 
const id = req.swagger.params.id.value;
module.updatedBy = req.user.email;
 
  // validateModule(module)
  // .then(() => { validateIpPort(module.localip,module.port,module.subroute)})
  // .then(()=>
  //   {
  //   return dbapi.updateRpAudioModule(id, module);
  // }).then(stats => {
  //   if (stats.replaced) {
	// console.log(stats,"qwertytredwrtyutre")

  //     res.json({ success: true });
  //   } else {
  //     res.status(404).json({ success: false, message: 'Module not found' });
  //   }
  // }).catch(err => {
  //   if (err.message === 'Subroute, localip, or port already exists') {
  //     res.status(400).json({ success: false, message: err.message });
  //   } else {
  //     apiutil.internalError(res, 'Failed to update module: ', err.stack);
  //   }
  // });
  try{
    validateModule(module);
    const existingModule = await dbapi.loadModule(id);
    if(!existingModule){
      return res.status(404).jsnon({success:false, message:"Module not found"})
    }
    const allModules = await dbapi.loadModules();
    const otherModules = allModules._responses[0]['r']     .filter(m => m.id !== id);
     if(nginxutil.validateAndUpdateNginxConfig(otherModules,module)){
      const updateModule = await dbapi.updateRpAudioModule(id,module);
      res.json({success:true, module:updateModule}) 
     }
    }
     catch(err){
      if(err.message === 'Local IP , Port or Subroute already exists' ||
        err.message === "Failed to reach the specified IP and Port" ||
        err.message === "Nginx configuration test failed" ||
        err.message === "Failed to Reload Nginx"
     ) {
       res.status(400).json({ success:false, message: err.message});
     }else {
         apiutil.internalError(res, 'Failed to update module: ', err.stack);
       }
 


     }

  }


 
async function deleteModule(req, res) {
const id = req.swagger.params.id.value;
  // dbapi.removeModule(id).then(stats => {
	// console.log(stats,"hgfdsdfghjhgfdsfgh")
  //   if (stats.deleted) {
  //     return dbapi.updateNginxConfig();
  //     res.json({ success: true });
  //   } else {
  //     res.status(404).json({ success: false, message: 'Module not found' });
  //   }
  // }).catch(err => {
  //   apiutil.internalError(res, 'Failed to delete module: ', err.stack);
  // });

  try{
    const moduleToDelete = await dbapi.loadModule(id);
    if(!moduleToDelete){
      return res.status(404).jsnon({success:false, message:"Module not found"})
    }
    const allModules = await dbapi.loadModules();
    console.log(allModules._responses[0]['r']);
    const updatedModules = allModules._responses[0]['r'].filter(m => m.id !== id);
    
    // For delete, we pass null as the new module
    await nginxutil.validateAndUpdateNginxConfig(updatedModules, null);
    
    // If Nginx update is successful, remove from database
    await dbapi.removeModule(id);
    
    res.json({ success: true, message: 'Module deleted successfully' });
  } catch (err) {
    apiutil.internalError(res, 'Failed to delete module: ', err.stack);
  }
}
