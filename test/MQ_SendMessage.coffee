kckmq = require 'kckupmq'
sender = require "../src/components/MQ/SendMessage"
socket = require "../src/lib/InternalSocket"
url = require 'url'

getConfig = ->
  return {} unless process.env.REDISTOGO_URL

  rtg = url.parse process.env.REDISTOGO_URL
  config.host = rtg.hostname
  config.port = rtg.port
  config.auth.password = rtg.auth.split(':')[1]
  config

getQueue = (clientId) ->
  kckmq.instance 'redis', getConfig(), clientId

setupComponent = ->
  c = sender.getComponent()
  src = socket.createSocket()
  clientId = socket.createSocket()
  c.inPorts.in.attach src
  c.inPorts.clientid.attach clientId
  [c, clientId, src]

exports['test sending grouped message'] = (test) ->
  mq = getQueue()
  [c, clientId, src] = setupComponent()

  clientId.send mq.clientId

  test.expect 1

  mq.subscribe 'foo', (err, topics) ->
    mq.on 'foo', (id, message) ->
      test.equal message, 'hello'
      do test.done

    src.beginGroup 'foo'
    src.send 'hello'

exports['test sending subgrouped message'] = (test) ->
  mq = getQueue()
  [c, clientId, src] = setupComponent()

  clientId.send mq.clientId

  test.expect 1

  mq.subscribe 'foo:bar', (err, topics) ->
    mq.on 'foo:bar', (id, message) ->
      test.equal message, 'hello'
      do test.done

    src.beginGroup 'foo'
    src.beginGroup 'bar'
    src.send 'hello'
