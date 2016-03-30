noflo = require '../../../../src/lib/NoFlo'

exports.getComponent = ->
  c = new noflo.Component
  c.description = "Output stuff"
  c.inPorts.add 'in',
    datatype: 'string'
  c.inPorts.add 'out',
    datatype: 'string'
  c.process = (input, output) ->
    data = input.getData 'in'
    console.log data
    output.sendDone
      out: data
  c
