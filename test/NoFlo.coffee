noflo = require '../src/lib/NoFlo.coffee'

exports['Test instantiation with empty Graph'] = (test) ->
  g = new noflo.Graph
  network = noflo.createNetwork g, ->
    test.ok network
    test.ok network.processes
    test.done()
