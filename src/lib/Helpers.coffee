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

# outPort wrapper for atomic sends w/ groups
class AtomicSender
  constructor: (@port, @groups) ->
  beginGroup: (group) ->
    @port.beginGroup group
  endGroup: ->
    @port.endGroup()
  connect: ->
    @port.connect()
  disconnect: ->
    @port.disconnect()
  send: (packet) ->
    @port.beginGroup group for group in @groups
    @port.send packet
    @port.endGroup() for group in @groups


exports.GroupedInput = (component, config, func) ->
  # In ports
  inPorts = if 'in' of config then config.in else 'in'
  unless Object.prototype.toString.call(inPorts) is '[object Array]'
    inPorts = [inPorts]
  # Out port
  outPort = if 'out' of config then config.out else 'out'
  # For async func
  config.async = false unless 'async' of config
  # Group requests by group ID
  config.group = false unless 'group' of config
  defaultForwarding = if config.group then true else false
  # Group requests by object field
  config.field = null unless 'field' of config
  # Forward group events from specific inputs to the output:
  # - false: don't forward anything
  # - true: forward unique groups of all inputs
  # - string: forward groups of a specific port only
  # - array: forward unique groups of inports in the list
  config.forwardGroups = defaultForwarding unless 'forwardGroups' of config

  forwardGroups = config.forwardGroups
  # Collect groups from each port?
  forwardGroups = inPorts if forwardGroups is true and not config.group
  # Collect groups from one and only port?
  forwardGroups = [forwardGroups] if typeof forwardGroups is 'string' and not config.group
  # Collect groups from any port, as we group by them
  forwardGroups = true if forwardGroups isnt false and config.group

  for name in inPorts
    unless component.inPorts[name]
      throw new Error "no inPort named '#{name}'"
  unless component.outPorts[outPort]
    throw new Error "no outPort named '#{outPort}'"

  groupedData = {}
  groupedDataGroups = {}

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
            key = ''
            if config.group and inPort.groups.length > 0
              key = inPort.groups.toString()
            else if config.field and typeof(payload) is 'object' and config.field of payload
              key = payload[config.field]

            groupedData[key] = {} unless key of groupedData
            groupedData[key][config.field] = key if config.field
            groupedData[key][port] = payload

            # Collect groups from multiple ports if necessary
            if Object.prototype.toString.call(forwardGroups) is '[object Array]' and forwardGroups.indexOf(port) isnt -1
              groupedDataGroups[key] = [] unless key of groupedDataGroups
              for grp in inPort.groups
                groupedDataGroups[key].push grp if groupedDataGroups[key].indexOf(grp) is -1

            # Flush the data if the tuple is complete
            requiredLength = if config.field then inPorts.length + 1 else inPorts.length
            if Object.keys(groupedData[key]).length is requiredLength
              groups = []
              if forwardGroups is true
                groups = inPort.groups
              else if forwardGroups isnt false
                groups = groupedDataGroups[key]

              atomicOut = new AtomicSender out, groups
              callback = (err) ->
                if err
                  component.error err, groups
                # For use with MultiError trait
                component.fail() if typeof component.fail is 'function' and component.hasErrors
                out.disconnect()
                delete groupedData[key]

              if config.async
                func groupedData[key], groups, atomicOut, callback
              else
                func groupedData[key], groups, atomicOut
                callback()

          when 'endgroup'
            inPort.groups.pop()
