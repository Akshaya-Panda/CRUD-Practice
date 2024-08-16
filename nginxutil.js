const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const request = require('request');
const path = require('path');
const glob = require('glob');

 
const NGINX_DIR = '/etc/nginx/conf.d';
 
function generateConfigEntry(module) {
    const subrouteWithoutSlash = module.subroute.replace(/\/$/, '');
    const subroute_manager = `${subrouteWithoutSlash}-manager/`;
    const subroute_websocket = `${subrouteWithoutSlash}-websocket/`;
    
    return `
        location ${module.subroute} {
            proxy_pass http://${module.localip}:${module.moduleport}/;
        }
 
        location ${subroute_manager} {
            proxy_pass http://${module.localip}:${module.managerport}/;
        }
 
        location ${subroute_websocket} {
            proxy_pass http://${module.localip}:${module.websocketport}/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header X-Forwarded-For $remote_addr;
            proxy_set_header X-Real-IP $remote_addr;
        }
    `;
}
 
function getConfigFilePath(module) {
    const filename = module.subroute.replace(/\//g, '') + '.rpconf';
    return path.join(NGINX_DIR, filename);
}
 
function writeConfigFile(module, configEntries) {
    const configContent = configEntries.join('\n\n');
    const filePath = getConfigFilePath(module);
    fs.writeFileSync(filePath, configContent, 'utf8');
}
 
function updateConfigFile(module, configEntries) {
    const configContent = configEntries.join('\n\n');
    const filePath = getConfigFilePath(module);
    fs.writeFileSync(filePath, configContent, 'utf8');
}
 
async function deleteConfigFile(module) {
    const filePath = getConfigFilePath(module);
    await execPromise(`sudo rm ${filePath}`);
}
 
async function testNginxConfig() {
    try {
        await execPromise('sudo nginx -t');
        return true;
    } catch (error) {
        console.error('Nginx configuration test failed', error);
        return false;
    }
}
 
async function reloadNginx() {
    try {
        await execPromise('sudo systemctl reload nginx');
        console.log('Nginx reloaded successfully');
        return true;
    } catch (error) {
        console.error('Failed to reload Nginx', error);
        return false;
    }
}
 
async function checkIpPortAvailability(localip, port) {
    const url = `http://${localip}:${port}`;
    try {
        const response = await util.promisify(request.get)(url, { timeout: 5000 });
        if(response.statusCode === 502){
            console.log(`${url}`);
            return false
        }
        return true;
    } catch (error) {
        console.log(`Failed to reach ${url}: ${error.message}`);
        return false;
    }
}
 
async function readExistingConfigs() {
    return new Promise((resolve, reject) => {
        glob(`${NGINX_DIR}/*.rpconf`, (err, files) => {
            if (err) {
                return reject(err);
            }
 
            const modules = files.map(file => {
                const content = fs.readFileSync(file, 'utf8');
                const subrouteMatch = content.match(/location\s+(.+?)\s+\{/);
                const proxyMatch = content.match(/proxy_pass\s+http:\/\/([^:]+):(\d+)\//);
 
                if (subrouteMatch && proxyMatch) {
                    return {
                        subroute: subrouteMatch[1],
                        localip: proxyMatch[1],
                        moduleport: proxyMatch[2]
                    };
                }
                return null;
            }).filter(module => module);
 
            resolve(modules);
        });
    });
}

async function checkUniqueness(newModule) {
    const existingModules = await readExistingConfigs();
 
    return !existingModules.some(module =>
        (module.localip === newModule.localip || 
            (module.moduleport === newModule.moduleport ||
            module.managerport === newModule.managerport ||
            module.websocketport === newModule.websocketport)) ||
            (module.subroute === newModule.subroute)
    );
}
 
async function validateAndUpdateNginxConfig(newModule) {
    if (newModule) {
        const modulePorts = [newModule.moduleport, newModule.managerport];
        for (const port of modulePorts) {
            const isAvailable = await checkIpPortAvailability(newModule.localip, newModule.moduleport);
            if (!isAvailable) {
                throw new Error('Failed to reach the specified IP and Port');
                break;
            }
        }
            
                if (!await checkUniqueness(newModule)) {                    
                    
                    
                    throw new Error('Local IP, Port or Subroute already exists');
                    }
                
            
                    const configEntries = [generateConfigEntry(newModule)];
                    await writeConfigFile(newModule, configEntries);
        
 
        const isConfigValid = await testNginxConfig();
        if (!isConfigValid) {
            // If config test fails, remove the created file
            await deleteConfigFile(newModule);
            throw new Error('Nginx configuration test failed');
        }
 
        const isReloaded = await reloadNginx();
        if (!isReloaded) {
            // If reload fails, remove the created file
            await deleteConfigFile(newModule);
            throw new Error('Failed to Reload Nginx');
        }
 
    } else {
        throw new Error('Module cannot be null for updates');
    }
}
 
async function validateAndUpdateConfigForModule(module, newModule) {
    if (newModule) {
        const modulePorts = [newModule.moduleport, newModule.managerport, newModule.websocketport];
        for (const port of modulePorts) {
            const isAvailable = await checkIpPortAvailability(newModule.localip, port);
            if (!isAvailable) {
                throw new Error('Failed to reach the specified IP and Port');
            }
        }
 
        // Allow partial updates: only validate IP and Port if they are being changed
        const partialUpdate = (newModule.localip !== module.localip ||
                               newModule.moduleport !== module.moduleport||
                               newModule.managerport !== module.managerport ||
                               newModule.websocketport !== module.websocketport);
 
        if (partialUpdate && !await checkUniqueness(newModule)) {
            throw new Error('Local IP, Port or Subroute already exists');
        }
 
        // Backup existing configuration before updating
        const originalConfigFilePath = getConfigFilePath(module);
        const originalConfigBackupPath = `${originalConfigFilePath}.bak`;
        fs.copyFileSync(originalConfigFilePath, originalConfigBackupPath);
 
        // Update the configuration file
        await updateConfigFile(newModule, [generateConfigEntry(newModule)]);
 
        const isConfigValid = await testNginxConfig();
        if (!isConfigValid) {
            // If config test fails, restore the backup
            fs.copyFileSync(originalConfigBackupPath, originalConfigFilePath);
            await deleteConfigFile(newModule);
            throw new Error('Nginx configuration test failed');
        }
 
        const isReloaded = await reloadNginx();
        if (!isReloaded) {
            // If reload fails, restore the backup
            fs.copyFileSync(originalConfigBackupPath, originalConfigFilePath);
            await deleteConfigFile(newModule);
            throw new Error('Failed to Reload Nginx');
        }
 
        
        fs.unlinkSync(originalConfigBackupPath);
        await deleteConfigFile(module);
 
    } else {
        throw new Error('Module cannot be null for updates');
    }
}
 
async function deleteModuleConfig(module) {
    if (module) {
        await deleteConfigFile(module);
 
        const isConfigValid = await testNginxConfig();
        if (!isConfigValid) {
            throw new Error('Nginx configuration test failed');
        }
 
        const isReloaded = await reloadNginx();
        if (!isReloaded) {
            throw new Error('Failed to Reload Nginx');
        }
    } else {
        throw new Error('Module cannot be null for deletion');
    }
}
 
module.exports = {
    validateAndUpdateNginxConfig,
    validateAndUpdateConfigForModule,
    deleteModuleConfig,
    checkUniqueness
};
