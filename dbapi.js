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

  dbapi.checkFields = function(localip, port, subroute) {
    return db.run(
        r.table('rpAudioModules').filter({
          localip: localip,
          port: port,
          subroute: subroute
        }).count().eq(0)
      ).then(count => count > 0);
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
      
      // Check for uniqueness before inserting
      return dbapi.checkFields(newModule.localip, newModule.port, newModule.subroute)
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
      
      // Check for uniqueness before updating
      return dbapi.loadModule(id).then(existingModule => {
        if (!existingModule) {
          throw new Error('Module not found');
        }
        return dbapi.checkFields(updatedModule.localip, updatedModule.port, updatedModule.subroute)
          .then(isUnique => {
            if (!isUnique) {
              throw new Error('Subroute, localip, or port already exists');
            }
    return db.run(r.table('rpAudioModules').get(id).update(updatedModule));
          });
      });
    };
