noflo = require 'noflo'
kckupmq = require 'kckupmq'
url = require 'url'

class QueueComponent extends noflo.Component
  basePortSetup: ->
    @config = @checkEnv()
    @clientId = null
    @mqType = 'redis'

    @inPorts =
      config: new noflo.Port
      clientid: new noflo.Port

    @inPorts.config.on 'data', (data) =>
      @config = data
    @inPorts.clientid.on 'data', (data) =>
      @clientId = data

  checkEnv: ->
    # Redis config for use inside Heroku nodes
    return {} unless process.env.REDISTOGO_URL

    rtg = url.parse process.env.REDISTOGO_URL
    config.host = rtg.hostname
    config.port = rtg.port
    config.auth.password = rtg.auth.split(':')[1]
    config

  getMQ: ->
    kckupmq.instance @mqType, @config, @clientId

exports.QueueComponent = QueueComponent
