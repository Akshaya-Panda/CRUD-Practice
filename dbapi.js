dbapi.loadAccessToken = function (id) {
  return db.run(r.table('accessTokens').get(id))
}

dbapi.loadModules = function() {
  return db.run(r.table('rpAudioModules'));
  }
   
dbapi.loadModule= function(id) {
  return db.run(r.table('rpAudioModules').get(id));
  }
   
dbapi.saveModule = function(module) {
  return db.run(r.table('rpAudioModules').insert(module));
  }
  
dbapi.updateModule = function(id,module) {
  return db.run(r.table('rpAudioModules').get(id).update(module));
  }
   
dbapi.removeModule = function(id) {
  return db.run(r.table('rpAudioModules').get(id).delete());
  }

  dbapi.checkFields = function(localip, moduleport,managerport,websocketport, subroute) {
    return db.run(
        r.table('rpAudioModules').filter(function(module) {
          return module('localip').eq(localip)
            .and(module('moduleport').eq(moduleport))
            .and(module('managerport').eq(managerport))
            .and(module('websocketport').eq(websocketport))
            .or(module('subroute').eq(subroute));
        })
        .count()
    ).then(count => count === 0);
  };


  dbapi.validateSubroute = function(subroute) {
    const subroutePattern = /^\/.*\/$/;
    if (!subroutePattern.test(subroute)) {
      throw new Error('Subroute must start and end with a forward slash');
    }
  };
     
    // Ensure that no duplicate records are inserted by checking uniqueness
    dbapi.insertRpAudioModule = function (module) {
      const now = new Date();
      const newModule = {
        ...module,
        createdBy: module.createdBy || 'unknown',
        createdOn: now,
        updatedBy: module.updatedBy || 'unknown',
        updatedOn: now
      };
      
      dbapi.validateSubroute(newModule.subroute);

      // Check for uniqueness before inserting
      return dbapi.checkFields(newModule.localip, newModule.moduleport,newModule.managerport,newModule.websocketport,newModule.subroute)
        .then(isUnique => {
          if (!isUnique) {
            throw new Error('Subroute, localip, or port already exists');
          }
    return db.run(r.table('rpAudioModules').insert(newModule));

        });
    };
     
    // Ensure that no duplicate records are updated by checking uniqueness
    dbapi.updateRpAudioModule = function (id, module) {
      const now = new Date();
      const updatedModule = {
        ...module,
        updatedBy: module.updatedBy || 'unknown',
        updatedOn: now
      };

      dbapi.validateSubroute(updatedModule.subroute);
      
      // Check for uniqueness before updating
      return dbapi.loadModule(id).then(existingModule => {
        if (!existingModule) {
          throw new Error('Module not found');
        }
        return dbapi.checkFields(updatedModule.localip, updatedModule.moduleport,updatedModule.managerport,updatedModule.websocketport
          , updatedModule.subroute)
          .then(isUnique => {
            if (!isUnique) {
              throw new Error('Subroute, localip, or port already exists');4
            }
    return db.run(r.table('rpAudioModules').get(id).update(updatedModule));
          });
      });
    };
