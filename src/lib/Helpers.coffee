#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014 The Grid
#     NoFlo may be freely distributed under the MIT license
#

# MapComponent maps a single inport to a single outport, forwarding all
# groups from in to out and calling `func` on each incoming packet
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
    @groupsSent = false
  beginGroup: (group) ->
    @port.beginGroup group
  endGroup: ->
    @port.endGroup()
  connect: ->
    @port.connect()
    @groupsSent = false
  disconnect: ->
    @port.endGroup() for group in @groups
    @port.disconnect()
    @groupsSent = false
  send: (packet) ->
    unless @groupsSent
      @port.beginGroup group for group in @groups
      @groupsSent = true
    @port.send packet

# GroupedInput makes your component collect data from several inports
# and activates a handler `func` only when a tuple from all of these
# ports is complete. The signature of handler function is:
# ```
# func = (combinedInputData, inputGroups, outputPort, asyncCallback) ->
# ```
#
# With `config.group = true` it checks incoming group IPs and collates
# data with matching group IPs. By default this kind of grouping is `false`.
#
# With `config.field = 'fieldName' it collates incoming data by specified
# field. This kind of grouping is disabled by default.
#
# With `config.forwardGroups = true` it would forward group IPs from
# inputs to the output sending them along with the data. This option also
# accepts string or array values, if you want to forward groups from specific
# port(s) only. By default group forwarding is `true` if `group` option is
# enabled and is `false` otherwise.
#
# GroupedInput supports both sync and async `func` handlers. In latter case
# pass `config.async = true` and make sure that `func` accepts callback as
# 4th parameter and calls it when async operation completes or fails.
#
# GroupedInput sends group packets, sends data packets emitted by `func`
# via its `outputPort` argument, then closes groups and disconnects
# automatically.
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

  # Embed UI metadata
  component.metadata = {} unless component.metadata
  component.metadata.groupedInputs = inPorts if inPorts.length > 1
  component.metadata.async = config.async

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
          when 'endgroup'
            inPort.groups.pop()
          when 'data'
            key = ''
            if config.group and inPort.groups.length > 0
              key = inPort.groups.toString()
            else if config.field and typeof(payload) is 'object' and config.field of payload
              key = payload[config.field]

            groupedData[key] = {} unless key of groupedData
            groupedData[key][config.field] = key if config.field
            if inPorts.length is 1
              groupedData[key] = payload
            else
              groupedData[key][port] = payload

            # Collect groups from multiple ports if necessary
            if Object.prototype.toString.call(forwardGroups) is '[object Array]' and forwardGroups.indexOf(port) isnt -1
              groupedDataGroups[key] = [] unless key of groupedDataGroups
              for grp in inPort.groups
                groupedDataGroups[key].push grp if groupedDataGroups[key].indexOf(grp) is -1

            # Flush the data if the tuple is complete
            requiredLength = if config.field then inPorts.length + 1 else inPorts.length
            if requiredLength is 1 or Object.keys(groupedData[key]).length is requiredLength
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
                atomicOut.disconnect()
                delete groupedData[key]

              if config.async
                func groupedData[key], groups, atomicOut, callback
              else
                func groupedData[key], groups, atomicOut
                callback()

  # Make it chainable or usable at the end of getComponent()
  return component
