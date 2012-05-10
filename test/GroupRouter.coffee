router = require "../src/components/GroupRouter"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
  c = router.getComponent()
  routes = socket.createSocket()
  src = socket.createSocket()
  missed = socket.createSocket()
  c.inPorts.routes.attach routes
  c.inPorts.in.attach src
  c.outPorts.missed.attach missed
  [c, routes, src, missed]

exports['test routing error'] = (test) ->
  test.expect 1
  [c, routes, src, missed] = setupComponent()
  routes.send 'foo,bar'
  missed.once 'data', (data) ->
    test.equal data, 'hello'
    test.done()
  src.beginGroup 'baz'
  src.send 'hello'

exports['test routing success'] = (test) ->
  test.expect 1
  [c, routes, src, missed] = setupComponent()
  routes.send 'foo,bar'
  dst1 = socket.createSocket()
  dst2 = socket.createSocket()
  c.outPorts.out.attach dst1
  c.outPorts.out.attach dst2
  dst2.once 'data', (data) ->
    test.equal data, 'hello'
    test.done()
  src.beginGroup 'bar'
  src.send 'hello'

exports['test routing subgroup error'] = (test) ->
  test.expect 1
  [c, routes, src, missed] = setupComponent()
  routes.send 'foo:baz,bar:baz'
  missed.once 'data', (data) ->
    test.equal data, 'hello'
    test.done()
  src.beginGroup 'bar'
  src.send 'hello'

exports['test routing subgroup success'] = (test) ->
  test.expect 1
  [c, routes, src, missed] = setupComponent()
  routes.send 'foo:baz,bar:baz'
  dst1 = socket.createSocket()
  dst2 = socket.createSocket()
  c.outPorts.out.attach dst1
  c.outPorts.out.attach dst2
  dst2.once 'data', (data) ->
    test.equal data, 'hello'
    test.done()
  src.beginGroup 'bar'
  src.beginGroup 'baz'
  src.send 'hello'
