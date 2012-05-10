kckmq = require 'kckupmq'
sender = require "../src/components/MQ/Queue"
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
  topic = socket.createSocket()
  clientId = socket.createSocket()
  out = socket.createSocket()
  c.inPorts.topic.attach topic
  c.inPorts.clientid.attach clientId
  c.outPorts.out.attach out
  [c, clientId, topic, out]

exports['test receiving message for grouped topic'] = (test) ->
  mq = getQueue()
  [c, clientId, topic, out] = setupComponent()

  clientId.send mq.clientId
  do topic.connect

  test.expect 2

  groups = []
  out.on 'begingroup', (group) ->
    groups.push group
  out.on 'data', (data) ->
    test.equals data, 'hello'
    test.equals groups.join(':'), 'foo'
    do mq.disconnect
    do c.disconnectMQ
    do test.done
  out.on 'endgroup', ->
    groups.pop()

  topic.send 'foo'
  mq.publish 'foo', 'hello'

exports['test receiving message for subgrouped topic'] = (test) ->
  mq = getQueue()
  [c, clientId, topic, out] = setupComponent()

  clientId.send mq.clientId
  do topic.connect

  test.expect 2

  groups = []
  out.on 'begingroup', (group) ->
    groups.push group
  out.on 'data', (data) ->
    test.equals data, 'hello'
    test.equals groups.join(':'), 'foo:bar'
    do mq.disconnect
    do c.disconnectMQ
    do test.done
  out.on 'endgroup', ->
    groups.pop()

  topic.send 'foo:bar'
  mq.publish 'foo:bar', 'hello'
