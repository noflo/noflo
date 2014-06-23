#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014 TheGrid (Rituwall Inc.)
#     NoFlo may be freely distributed under the MIT license
StreamSender = require('./Streams').StreamSender
StreamReceiver = require('./Streams').StreamReceiver

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

# WirePattern makes your component collect data from several inports
# and activates a handler `proc` only when a tuple from all of these
# ports is complete. The signature of handler function is:
# ```
# proc = (combinedInputData, inputGroups, outputPorts, asyncCallback) ->
# ```
#
# With `config.group = true` it checks incoming group IPs and collates
# data with matching group IPs. By default this kind of grouping is `false`.
# Set `config.group` to a RegExp object to correlate inputs only if the
# group matches the expression (e.g. `^req_`). For non-matching groups
# the component will act normally.
#
# With `config.field = 'fieldName' it collates incoming data by specified
# field. The component's proc function is passed a combined object with
# port names used as keys. This kind of grouping is disabled by default.
#
# With `config.forwardGroups = true` it would forward group IPs from
# inputs to the output sending them along with the data. This option also
# accepts string or array values, if you want to forward groups from specific
# port(s) only. By default group forwarding is `false`.
#
# `config.receiveStreams = [portNames]` feature makes the component expect
# substreams on specific inports instead of separate IPs (brackets and data).
# It makes select inports emit `Substream` objects on `data` event
# and silences `beginGroup` and `endGroup` events.
#
# `config.sendStreams = [portNames]` feature makes the component emit entire
# substreams of packets atomically to the outport. Atomically means that a
# substream cannot be interrupted by other packets, which is important when
# doing asynchronous processing. In fact, `sendStreams` is enabled by default
# on all outports when `config.async` is `true`.
#
# WirePattern supports both sync and async `proc` handlers. In latter case
# pass `config.async = true` and make sure that `proc` accepts callback as
# 4th parameter and calls it when async operation completes or fails.
#
# WirePattern sends group packets, sends data packets emitted by `proc`
# via its `outputPort` argument, then closes groups and disconnects
# automatically.
exports.WirePattern = (component, config, proc) ->
  # In ports
  inPorts = if 'in' of config then config.in else 'in'
  inPorts = [ inPorts ] unless inPorts instanceof Array
  # Out ports
  outPorts = if 'out' of config then config.out else 'out'
  outPorts = [ outPorts ] unless outPorts instanceof Array
  # For async process
  config.async = false unless 'async' of config
  # Keep correct output order for async mode
  config.ordered = false unless 'ordered' of config
  # Group requests by group ID
  config.group = false unless 'group' of config
  # Group requests by object field
  config.field = null unless 'field' of config
  # Forward group events from specific inputs to the output:
  # - false: don't forward anything
  # - true: forward unique groups of all inputs
  # - string: forward groups of a specific port only
  # - array: forward unique groups of inports in the list
  config.forwardGroups = false unless 'forwardGroups' of config
  # Receive streams feature
  config.receiveStreams = false unless 'receiveStreams' of config
  if typeof config.receiveStreams is 'string'
    config.receiveStreams = [ config.receiveStreams ]
  # Send streams feature
  config.sendStreams = false unless 'sendStreams' of config
  if typeof config.sendStreams is 'string'
    config.sendStreams = [ config.sendStreams ]
  config.sendStreams = outPorts if config.async
  # Parameter ports
  config.params = [] unless 'params' of config

  collectGroups = config.forwardGroups
  # Collect groups from each port?
  if typeof collectGroups is 'boolean' and not config.group
    collectGroups = inPorts
  # Collect groups from one and only port?
  if typeof collectGroups is 'string' and not config.group
    collectGroups = [collectGroups]
  # Collect groups from any port, as we group by them
  if collectGroups isnt false and config.group
    collectGroups = true

  for name in inPorts
    unless component.inPorts[name]
      throw new Error "no inPort named '#{name}'"
  for name in outPorts
    unless component.outPorts[name]
      throw new Error "no outPort named '#{name}'"

  groupedData = {}
  groupedDataGroups = {}

  # For ordered output
  q = []
  processQueue = ->
    while q.length > 0
      streams = q[0]
      # At least one of the outputs has to be resolved
      # for output streams to be flushed.
      flushed = false
      if outPorts.length is 1
        if streams.resolved
          flushed = streams.flush()
          q.shift() if flushed
      else
        for key, stream of streams
          if stream.resolved
            flushed = stream.flush()
            q.shift() if flushed
      return unless flushed

  if config.async
    component.load = 0 if 'load' of component.outPorts
    # Create before and after hooks
    component.beforeProcess = (outs) ->
      q.push outs if config.ordered
      component.load++
      if 'load' of component.outPorts and component.outPorts.load.isAttached()
        component.outPorts.load.send component.load
        component.outPorts.load.disconnect()
    component.afterProcess = (err, outs) ->
      processQueue()
      component.load--
      if 'load' of component.outPorts and component.outPorts.load.isAttached()
        component.outPorts.load.send component.load
        component.outPorts.load.disconnect()

  # Parameter ports
  taskQ = []
  component.params = {}
  requiredParamsCount = 0
  completeParamsCount = 0
  for port in config.params
    unless component.inPorts[port]
      throw new Error "no inPort named '#{port}'"
    requiredParamsCount++ if component.inPorts[port].isRequired()
  for port in config.params
    do (port) ->
      inPort = component.inPorts[port]
      inPort.process = (event, payload) ->
        # Param ports only react on data
        return unless event is 'data'
        component.params[port] = payload
        completeParamsCount = Object.keys(component.params).length
        # Trigger pending procs if all params are complete
        if completeParamsCount >= requiredParamsCount and taskQ.length > 0
          while taskQ.length > 0
            task = taskQ.shift()
            task()

  # Grouped ports
  for port in inPorts
    do (port) ->
      # Support for StreamReceiver ports
      if config.receiveStreams and config.receiveStreams.indexOf(port) isnt -1
        inPort = new StreamReceiver component.inPorts[port]
      else
        inPort = component.inPorts[port]
      inPort.groups = []

      # Set processing callback
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
              if config.group instanceof RegExp
                key = '' unless config.group.test key
            else if config.field and typeof(payload) is 'object' and
            config.field of payload
              key = payload[config.field]

            groupedData[key] = {} unless key of groupedData
            groupedData[key][config.field] = key if config.field
            if inPorts.length is 1
              groupedData[key] = payload
            else
              groupedData[key][port] = payload

            # Collect unique groups from multiple ports if necessary
            if collectGroups instanceof Array and
            collectGroups.indexOf(port) isnt -1
              groupedDataGroups[key] = [] unless key of groupedDataGroups
              for grp in inPort.groups
                if groupedDataGroups[key].indexOf(grp) is -1
                  groupedDataGroups[key].push grp

            # Flush the data if the tuple is complete
            requiredLength = inPorts.length
            ++requiredLength if config.field
            if requiredLength is 1 or
            Object.keys(groupedData[key]).length is requiredLength
              if collectGroups is true
                groups = inPort.groups
              else
                groups = groupedDataGroups[key]

              # Reset port group buffers or it may keep them for next turn
              component.inPorts[p].groups = [] for p in inPorts

              # Prepare outputs
              outs = {}
              for name in outPorts
                if config.async or config.sendStreams and
                config.sendStreams.indexOf(name) isnt -1
                  outs[name] = new StreamSender component.outPorts[name], config.ordered
                else
                  outs[name] = component.outPorts[name]

              outs = outs[outPorts[0]] if outPorts.length is 1 # for simplicity

              whenDone = (err) ->
                if err
                  component.error err, groups
                # For use with MultiError trait
                if typeof component.fail is 'function' and component.hasErrors
                  component.fail()
                # Disconnect outputs if still connected,
                # this also indicates them as resolved if pending
                if outPorts.length is 1
                  outs.endGroup() for g in groups if config.forwardGroups
                  outs.disconnect()
                else
                  for name, out of outs
                    out.endGroup() for g in groups if config.forwardGroups
                    out.disconnect()
                if typeof component.afterProcess is 'function'
                  component.afterProcess err or component.hasErrors, outs

              # Prepare data
              data = groupedData[key]
              # Clean buffers
              delete groupedData[key]
              delete groupedDataGroups[key]

              # Before hook
              if typeof component.beforeProcess is 'function'
                component.beforeProcess outs

              # Group forwarding
              if outPorts.length is 1
                outs.beginGroup g for g in groups if config.forwardGroups
              else
                for name, out of outs
                  out.beginGroup g for g in groups if config.forwardGroups

              # Call the proc function
              if config.async
                task = ->
                  proc data, groups, outs, whenDone
              else
                task = ->
                  proc data, groups, outs
                  whenDone()
              if completeParamsCount >= requiredParamsCount
                task()
              else
                taskQ.push task

  # Make it chainable or usable at the end of getComponent()
  return component

# Alias for compatibility with 0.5.3
exports.GroupedInput = exports.WirePattern


# `CustomError` returns an `Error` object carrying additional properties.
exports.CustomError = (message, options) ->
  err = new Error message
  return exports.CustomizeError err, options

# `CustomizeError` sets additional options for an `Error` object.
exports.CustomizeError = (err, options) ->
  for own key, val of options
    err[key] = val
  return err


# `MultiError` simplifies throwing and handling multiple error objects
# during a single component activation.
#
# `group` is an optional group ID which will be used to wrap all error
# packets emitted by the component.
exports.MultiError = (component, group = '', errorPort = 'error') ->
  unless errorPort of component.outPorts
    throw new Error "Missing error port '#{errorPort}'"

  component.hasErrors = false
  component.errors = []

  # Override component.error to support group information
  component.error = (e, groups = []) ->
    component.errors.push
      err: e
      groups: groups
    component.hasErrors = true

  # Fail method should be called to terminate process immediately
  # or to flush error packets.
  component.fail = (e = null, groups = []) ->
    component.error e, groups if e
    return unless component.hasErrors
    component.outPorts[errorPort].beginGroup group if group
    for error in component.errors
      component.outPorts[errorPort].beginGroup grp for grp in error.groups
      component.outPorts[errorPort].send error.err
      component.outPorts[errorPort].endGroup() for grp in error.groups
    component.outPorts[errorPort].endGroup() if group
    component.outPorts[errorPort].disconnect()
    # Clean the status for next activation
    component.hasErrors = false
    component.errors = []

  return component
