noflo = require '../../lib/NoFlo'

class GroupRouter extends noflo.Component
  constructor: ->
    @routes = []
    @groups = []

    @inPorts =
      routes: new noflo.Port
      in: new noflo.ArrayPort
    @outPorts =
      out: new noflo.ArrayPort
      missed: new noflo.Port

    @inPorts.routes.on 'data', (data) =>
      if typeof data is 'string'
        data = data.split ','
      @routes = data

    @inPorts.in.on 'begingroup', (group) =>
      @groups.push group

    @inPorts.in.on 'data', (data) =>
      selected = @routes.indexOf @groups.join ':'
      return @outPorts.missed.send data if selected is -1
      @outPorts.out.send data, selected

    @inPorts.in.on 'endgroup', =>
      do @groups.pop

    @inPorts.in.on 'disconnect', =>
      @groups = []
      @outPorts.out.disconnect()
      @outPorts.missed.disconnect()
 
exports.getComponent = -> new GroupRouter
