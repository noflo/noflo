store = require "../src/components/WebService/RestfulMetrics/StoreDataPoint"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
  c = store.getComponent()
  key = socket.createSocket()
  id = socket.createSocket()
  ins = socket.createSocket()
  out = socket.createSocket()
  err = socket.createSocket()
  c.inPorts.apikey.attach key
  c.inPorts.appid.attach id
  c.inPorts.in.attach ins
  c.outPorts.out.attach out
  c.outPorts.error.attach err
  [c, key, id, ins, out, err]

exports['test sending a metric without API key'] = (test) ->
  test.expect 1
  [c, apiKey, appId, ins, out, err] = setupComponent()
  apiKey.send 'foo_baz_baz'
  appId.send 'noflo_test'

  err.once 'data', (data) ->
    test.equal data, 'This account API key is unauthorized to perform this action.'
    test.done()
  ins.send 'foo'

if process.env.RESTFUL_METRICS_API_KEY
  # We can only run these tests with a valid API key

  exports['test sending a metric'] = (test) ->
    test.expect 1
    [c, apiKey, appId, ins, out, err] = setupComponent()
    apiKey.send process.env.RESTFUL_METRICS_API_KEY
    appId.send 'noflo_test'

    out.once 'data', (data) ->
      test.equal data, 'foo'
      test.done()
    ins.send 'foo'
