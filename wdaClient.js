 screenshot: function() {
          return new Promise((resolve, reject) => {
            this.handleRequest({
              method: 'GET',
              uri: `${this.baseUrl}/screenshot?quality=50`,
              json: true
            })
              .then(response => {
                try {
                  resolve(response)
                } catch(e) {
                  reject(e)
                }
              })
              .catch(err => reject(err))
          })
        },
        rotation: function(params) {
          this.orientation = params.orientation

          return this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/orientation`,
            body: params,
            json: true
          })
        },
        batteryIosEvent: function() {
          return this.handleRequest({
            method: 'GET',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/batteryInfo`,
            json: true,
          })
            .then((batteryInfoResponse) => {
              let status = '-'

              if (batteryInfoResponse.value.state === 3) {
                status = 'full'
              }
              if (batteryInfoResponse.value.state === 2) {
                status = 'charging'
              }
              push.send([
                wireutil.global,
                wireutil.envelope(new wire.BatteryIosEvent(
                  options.serial,
                  'good',
                  'usb',
                  status,
                  parseInt(batteryInfoResponse.value.level * 100, 10),
                  'n/a',
                  100,
                ))
              ])
            })
            .catch((err) => log.info(err))
        },
        getTreeElements: function() {
          return this.handleRequest({
            method: 'GET',
            uri: `${this.baseUrl}/source?format=json`,
            json: true
          })
        },
        pressButton: function(params) {
          return this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
            body: {
              name: params
            },
            json: true
          })
        },
        appActivate: function(params) {
          return this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/apps/activate`,
            body: {
              bundleId: params
            },
            json: true
          })
        },
        getIsLocked: function() { 
          return this.handleRequest({
          method: 'GET',
          uri: `${this.baseUrl}/session/${this.sessionId}/wda/locked`,
          json: true
        })
      },
      getWdaHealth: function(){ 
        return this.handleRequest({
        method: 'GET',
        uri: `${this.baseUrl}/wda/healthcheck`,
        json: true
      })
    },
        pressPower: function() {
          return this.handleRequest({
            method: 'GET',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/locked`,
            json: true
          })
            .then(response => {
              let url = ''
              if(response.value === true) {
                url = `${this.baseUrl}/session/${this.sessionId}/wda/unlock`
              } else {
                url = `${this.baseUrl}/session/${this.sessionId}/wda/lock`
              }
              return this.handleRequest({
                method: 'POST',
                uri: url,
                json: true
              })
            })
        },
