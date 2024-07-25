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

dbapi.insertRpAudioModule = function (module) {
  const now = new Date();
  const newModule = {
    ...module,
    createdBy: module.createdBy || 'unknown', 
    createdOn: now,
    updatedBy: module.updatedBy || 'unknown', 
    updatedOn: now
    };
  return db.run(r.table('rpAudioModules').insert(newModule));
  };
   
dbapi.updateRpAudioModule = function (id, module) {
  const now = new Date();
  const updatedModule = {
    ...module,
    updatedBy: module.updatedBy || 'unknown', 
    updatedOn: now
  };
  return db.run(r.table('rpAudioModules').get(id).update(updatedModule));
  };
