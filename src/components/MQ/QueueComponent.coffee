noflo = require 'noflo'
kckupmq = require 'kckupmq'
url = require 'url'

class QueueComponent extends noflo.Component
  basePortSetup: ->
    @config = @checkEnv()
    @mq = null

    @inPorts =
      config: new noflo.Port
      clientid: new noflo.Port

    @inPorts.config.on 'data', (data) =>
      @config = data
    @inPorts.clientid.on 'data', (data) =>
      @mq = @connectMQ data

  checkEnv: ->
    # Redis config for use inside Heroku nodes
    return {} unless process.env.REDISTOGO_URL

    rtg = url.parse process.env.REDISTOGO_URL
    config.host = rtg.hostname
    config.port = rtg.port
    config.auth.password = rtg.auth.split(':')[1]
    config

  connectMQ: (clientId) ->
    kckupmq.instance 'redis', @config, clientId

exports.QueueComponent = QueueComponent
