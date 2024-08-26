 .on('testassist.start', function (channel, responseChannel, data) {
          console.log(data,"these are the avlues coming in the data")
          joinChannel(responseChannel)
          push.send([
            channel
            , wireutil.transaction(
              responseChannel
              , new wire.TestAssistStartMessage(data)
            )
          ])
        })
        .on('testassist.stop', function (channel, responseChannel) {
          joinChannel(responseChannel)
          push.send([
            channel
            , wireutil.transaction(
              responseChannel
              , new wire.TestAssistStopMessage("ui")
            )
          ])
        })
        .on('testassist.status', function (channel, responseChannel) {
          joinChannel(responseChannel)
          push.send([
            channel
            , wireutil.transaction(
              responseChannel
              , new wire.TestAssistGetStatusMessage()
            )
          ])
        })
