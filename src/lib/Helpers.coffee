#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014 The Grid
#     NoFlo may be freely distributed under the MIT license
#
exports.MapComponent = (component, func, config) ->
  config = {} unless config
  config.inPort = 'in' unless config.inPort
  config.outPort = 'out' unless config.outPort

  inPort = component.inPorts[config.inPort]
  outPort = component.outPorts[config.outPort]
  groups = []
  inPort.process = (event, payload) ->
    switch event
      when 'connect' then outPort.connect()
      when 'begingroup'
        groups.push payload
        outPort.beginGroup payload
      when 'data'
        func payload, groups, outPort
      when 'endgroup'
        groups.pop()
        outPort.endGroup()
      when 'disconnect'
        groups = []
        outPort.disconnect()

exports.GroupComponent = (component, func, inPorts='in', outPort='out', config={}) ->
  unless Object.prototype.toString.call(inPorts) is '[object Array]'
    inPorts = [inPorts]

  for name in inPorts
    unless component.inPorts[name]
      throw new Error "no inPort named '#{name}'"
  unless component.outPorts[outPort]
    throw new Error "no outPort named '#{outPort}'"

  groupedData = {}

  out = component.outPorts[outPort]

  for port in inPorts
    do (port) ->
      inPort = component.inPorts[port]
      inPort.groups = []
      inPort.process = (event, payload) ->
        switch event
          when 'begingroup'
            inPort.groups.push payload
          when 'data'
            key = inPort.groups.toString()
            groupedData[key] = {} unless key of groupedData
            groupedData[key][port] = payload
            # Flush the data if the tuple is complete
            if Object.keys(groupedData[key]).length is inPorts.length
              out.beginGroup group for group in inPort.groups
              func groupedData[key], inPort.groups, out
              out.endGroup() for group in inPort.groups
              out.disconnect()
              delete groupedData[key]
          when 'endgroup'
            inPort.groups.pop()
