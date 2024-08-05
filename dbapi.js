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
        r.table('rpAudioModules').filter(function(module) {
          return module('localip').eq(localip)
            .and(module('port').eq(port))
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

      dbapi.validateSubroute(updatedModule.subroute);
      
      // Check for uniqueness before updating
      return dbapi.loadModule(id).then(existingModule => {
        if (!existingModule) {
          throw new Error('Module not found');
        }
        return dbapi.checkFields(updatedModule.localip, updatedModule.port, updatedModule.subroute)
          .then(isUnique => {
            if (!isUnique) {
              throw new Error('Subroute, localip, or port already exists');4
            }
    return db.run(r.table('rpAudioModules').get(id).update(updatedModule));
          });
      });
    };

    
  function generateConfigEntry(module) {
    return `#${module.id}
        location ${module.subroute} {
          proxy_pass http://${module.localip}:${module.port}/;
        }
      `;
    }
      
    
    function writeConfigFile(configEntries) {
      const configContent = configEntries.join('\n\n');
      fs.writeFileSync(file_path, configContent, 'utf8');
    }
      
    
    dbapi.updateNginxConfig=function() {
      
      return dbapi.loadModules().then(modules => {
        console.log(modules._responses[0]['r'],"qwertyuio")
        const configEntries = modules._responses[0]['r'].map(generateConfigEntry);
        writeConfigFile(configEntries);
      }).catch(err => {
        console.error('Failed to update Nginx config:', err);
      });
    }
