noflo = require "noflo"

exports.getComponent = ->
  c = new noflo.Component
  c.description = "Simple controller that says hello, user"
  c.inPorts.add 'in',
    datatype: 'object'
  c.outPorts.add 'out',
    datatype: 'object'
  c.outPorts.add 'data',
    datatype: 'object'
  c.process (input, output) ->
    return unless input.hasData 'in'
    request = input.getData 'in'
    output.sendDone
      out: request
      data:
        locals:
          string: "Hello, #{request.req.remoteUser}"
