const fs = require('fs');
const {exec} = require('child_process');
const util = require('util');
const execPromise =util.promisify(exec);
const request = require('request');

const  NGINX_PATH = '/etc/nginx/conf.d/audio.rpconf'

function generateConfigEntry(module) {
    return ` 
        location ${module.subroute} {
        proxy_pass http://${module.localip}:${module.port}/;
        }
    `;
    }

function writeConfigFile(configEntries) {
    const configContent = configEntries.join('\n\n');
    fs.writeFileSync(NGINX_PATH, configContent, 'utf8');
}

async function testNginxConfig() {
try{
    await execPromise('sudo nginx -t');
    return true;
}   catch(error){
    console.error('Nginx configuration test failed',error);
    return false;
}
}

async function reloadNginx(){
    try{
        await execPromise('sudo systemctl reload nginx');
        console.log('Nginx reloaded successfully')
    }
    catch(error){
    console.error("Failed  to reload Nginx", error);
    return false;
    }
}

async function checkIpPortAvailability(localip, port) {
    const url = `http://${localip}:${port}`;
//     const options = {
//     method: 'GET',
//     url: url,
//     headers: {}
//     };
    
//     return new Promise((resolve, reject) => {
//     request(options, (error, response) => {
//         if (error) {
//         return reject(new Error(`Failed to reach ${url}: ${error.message}`));
//         }
//     });
// });
// }
    try{
        await request.get(url,{timeout:5000});
        return true;
    }catch(error){
        console.log(`Failed to reach ${url}:${error.message}`);
        return false;
    }
}

function checkUniqueness(modules,newModule){
    const arrayModules= modules._responses[0]['r']
    return !arrayModules.some(module =>
    (module.localip === newModule.localip && module.port === newModule.port) || 
    module.subroute === newModule.subroute
    );
}

async function validateAndUpdateNginxConfig(modules, newModule){
    if(newModule){
    const isAvailable = await checkIpPortAvailability(newModule.localip, newModule.port);
    if(!isAvailable){
        throw new Error("Failed to reach the specified IP and Port");
    }

    if(!checkUniqueness(modules,newModule)){
        throw new Error('Local IP , Port or Subroute already exists');
    }



    const updatedModules = [...modules._responses[0]['r'],newModule];
    const configEntries = updatedModules.map(generateConfigEntry);
    writeConfigFile(configEntries);

    const isConfigValid = await testNginxConfig();
    if(!isConfigValid){
        throw new Error('Nginx configuration test failed')

    }

    const isReloaded = await reloadNginx();
    if(!isReloaded){
        throw new Error("Failed to Reload Nginx");
    }
}

    return true;
}

module.exports = {
    validateAndUpdateNginxConfig,
    checkUniqueness
}



