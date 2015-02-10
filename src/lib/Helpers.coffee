#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014 TheGrid (Rituwall Inc.)
#     NoFlo may be freely distributed under the MIT license
_ = require 'underscore'
StreamSender = require('./Streams').StreamSender
StreamReceiver = require('./Streams').StreamReceiver
InternalSocket = require './InternalSocket'

isArray = (obj) ->
  return Array.isArray(obj) if Array.isArray
  return Object.prototype.toString.call(arg) == '[object Array]'

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
  inPorts = [ inPorts ] unless isArray inPorts
  # Out ports
  outPorts = if 'out' of config then config.out else 'out'
  outPorts = [ outPorts ] unless isArray outPorts
  # Error port
  config.error = 'error' unless 'error' of config
  # For async process
  config.async = false unless 'async' of config
  # Keep correct output order for async mode
  config.ordered = true unless 'ordered' of config
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
  config.params = [ config.params ] if typeof config.params is 'string'
  # Node name
  config.name = '' unless 'name' of config
  # Drop premature input before all params are received
  config.dropInput = false unless 'dropInput' of config
  # Firing policy for addressable ports
  unless 'arrayPolicy' of config
    config.arrayPolicy =
      in: 'any'
      params: 'all'
  # Garbage collector frequency: execute every N packets
  config.gcFrequency = 100 unless 'gcFrequency' of config
  # Garbage collector timeout: drop packets older than N seconds
  config.gcTimeout = 300 unless 'gcTimeout' of config

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

  component.groupedData = {}
  component.groupedGroups = {}
  component.groupedDisconnects = {}

  disconnectOuts = ->
    # Manual disconnect forwarding
    for p in outPorts
      component.outPorts[p].disconnect() if component.outPorts[p].isConnected()

  sendGroupToOuts = (grp) ->
    for p in outPorts
      component.outPorts[p].beginGroup grp

  closeGroupOnOuts = (grp) ->
    for p in outPorts
      component.outPorts[p].endGroup grp

  # For ordered output
  component.outputQ = []
  processQueue = ->
    while component.outputQ.length > 0
      streams = component.outputQ[0]
      flushed = false
      # Null in the queue means "disconnect all"
      if streams is null
        disconnectOuts()
        flushed = true
      else
        # At least one of the outputs has to be resolved
        # for output streams to be flushed.
        if outPorts.length is 1
          tmp = {}
          tmp[outPorts[0]] = streams
          streams = tmp
        for key, stream of streams
          if stream.resolved
            stream.flush()
            flushed = true
      component.outputQ.shift() if flushed
      return unless flushed

  if config.async
    component.load = 0 if 'load' of component.outPorts
    # Create before and after hooks
    component.beforeProcess = (outs) ->
      component.outputQ.push outs if config.ordered
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
  component.taskQ = []
  component.params = {}
  component.requiredParams = []
  component.completeParams = []
  component.receivedParams = []
  component.defaultedParams = []
  component.defaultsSent = false

  component.sendDefaults = ->
    if component.defaultedParams.length > 0
      for param in component.defaultedParams
        if component.receivedParams.indexOf(param) is -1
          tempSocket = InternalSocket.createSocket()
          component.inPorts[param].attach tempSocket
          tempSocket.send()
          tempSocket.disconnect()
          component.inPorts[param].detach tempSocket
    component.defaultsSent = true

  resumeTaskQ = ->
    if component.completeParams.length is component.requiredParams.length and
    component.taskQ.length > 0
      # Avoid looping when feeding the queue inside the queue itself
      temp = component.taskQ.slice 0
      component.taskQ = []
      while temp.length > 0
        task = temp.shift()
        task()
  for port in config.params
    unless component.inPorts[port]
      throw new Error "no inPort named '#{port}'"
    component.requiredParams.push port if component.inPorts[port].isRequired()
    component.defaultedParams.push port if component.inPorts[port].hasDefault()
  for port in config.params
    do (port) ->
      inPort = component.inPorts[port]
      inPort.process = (event, payload, index) ->
        # Param ports only react on data
        return unless event is 'data'
        if inPort.isAddressable()
          component.params[port] = {} unless port of component.params
          component.params[port][index] = payload
          if config.arrayPolicy.params is 'all' and
          Object.keys(component.params[port]).length < inPort.listAttached().length
            return # Need data on all array indexes to proceed
        else
          component.params[port] = payload
        if component.completeParams.indexOf(port) is -1 and
        component.requiredParams.indexOf(port) > -1
          component.completeParams.push port
        component.receivedParams.push port
        # Trigger pending procs if all params are complete
        resumeTaskQ()

  # Disconnect event forwarding
  component.disconnectData = {}
  component.disconnectQ = []

  component.groupBuffers = {}
  component.keyBuffers = {}
  component.gcTimestamps = {}

  # Garbage collector
  component.dropRequest = (key) ->
    # Discard pending disconnect keys
    delete component.disconnectData[key] if key of component.disconnectData
    # Clean grouped data
    delete component.groupedData[key] if key of component.groupedData
    delete component.groupedGroups[key] if key of component.groupedGroups

  component.gcCounter = 0
  gc = ->
    component.gcCounter++
    if component.gcCounter % config.gcFrequency is 0
      current = new Date().getTime()
      for key, val of component.gcTimestamps
        if (current - val) > (config.gcTimeout * 1000)
          component.dropRequest key
          delete component.gcTimestamps[key]

  # Grouped ports
  for port in inPorts
    do (port) ->
      component.groupBuffers[port] = []
      component.keyBuffers[port] = null
      # Support for StreamReceiver ports
      if config.receiveStreams and config.receiveStreams.indexOf(port) isnt -1
        inPort = new StreamReceiver component.inPorts[port]
      else
        inPort = component.inPorts[port]

      needPortGroups = collectGroups instanceof Array and collectGroups.indexOf(port) isnt -1

      # Set processing callback
      inPort.process = (event, payload, index) ->
        component.groupBuffers[port] = [] unless component.groupBuffers[port]
        switch event
          when 'begingroup'
            component.groupBuffers[port].push payload
            if config.forwardGroups and (collectGroups is true or needPortGroups) and not config.async
              sendGroupToOuts payload
          when 'endgroup'
            component.groupBuffers[port] = component.groupBuffers[port].slice 0, component.groupBuffers[port].length - 1
            if config.forwardGroups and (collectGroups is true or needPortGroups) and not config.async
              closeGroupOnOuts payload
          when 'disconnect'
            if inPorts.length is 1
              if config.async or config.StreamSender
                if config.ordered
                  component.outputQ.push null
                  processQueue()
                else
                  component.disconnectQ.push true
              else
                disconnectOuts()
            else
              foundGroup = false
              key = component.keyBuffers[port]
              component.disconnectData[key] = [] unless key of component.disconnectData
              for i in [0...component.disconnectData[key].length]
                unless port of component.disconnectData[key][i]
                  foundGroup = true
                  component.disconnectData[key][i][port] = true
                  if Object.keys(component.disconnectData[key][i]).length is inPorts.length
                    component.disconnectData[key].shift()
                    if config.async or config.StreamSender
                      if config.ordered
                        component.outputQ.push null
                        processQueue()
                      else
                        component.disconnectQ.push true
                    else
                      disconnectOuts()
                    delete component.disconnectData[key] if component.disconnectData[key].length is 0
                  break
              unless foundGroup
                obj = {}
                obj[port] = true
                component.disconnectData[key].push obj

          when 'data'
            if inPorts.length is 1 and not inPort.isAddressable()
              data = payload
              groups = component.groupBuffers[port]
            else
              key = ''
              if config.group and component.groupBuffers[port].length > 0
                key = component.groupBuffers[port].toString()
                if config.group instanceof RegExp
                  reqId = null
                  for grp in component.groupBuffers[port]
                    if config.group.test grp
                      reqId = grp
                      break
                  key = if reqId then reqId else ''
              else if config.field and typeof(payload) is 'object' and
              config.field of payload
                key = payload[config.field]
              component.keyBuffers[port] = key

              component.groupedData[key] = [] unless key of component.groupedData
              component.groupedGroups[key] = [] unless key of component.groupedGroups
              foundGroup = false
              requiredLength = inPorts.length
              ++requiredLength if config.field
              # Check buffered tuples awaiting completion
              for i in [0...component.groupedData[key].length]
                # Check this buffered tuple if it's missing value for this port
                if not (port of component.groupedData[key][i]) or
                (component.inPorts[port].isAddressable() and
                config.arrayPolicy.in is 'all' and
                not (index of component.groupedData[key][i][port]))
                  foundGroup = true
                  if component.inPorts[port].isAddressable()
                    # Maintain indexes for addressable ports
                    unless port of component.groupedData[key][i]
                      component.groupedData[key][i][port] = {}
                    component.groupedData[key][i][port][index] = payload
                  else
                    component.groupedData[key][i][port] = payload
                  if needPortGroups
                    # Include port groups into the set of the unique ones
                    component.groupedGroups[key][i] = _.union component.groupedGroups[key][i], component.groupBuffers[port]
                  else if collectGroups is true
                    # All the groups we need are here in this port
                    component.groupedGroups[key][i][port] = component.groupBuffers[port]
                  # Addressable ports may require other indexes
                  if component.inPorts[port].isAddressable() and
                  config.arrayPolicy.in is 'all' and
                  Object.keys(component.groupedData[key][i][port]).length <
                  component.inPorts[port].listAttached().length
                    return # Need data on other array port indexes to arrive

                  groupLength = Object.keys(component.groupedData[key][i]).length
                  # Check if the tuple is complete
                  if groupLength is requiredLength
                    data = (component.groupedData[key].splice i, 1)[0]
                    # Strip port name if there's only one inport
                    if inPorts.length is 1 and inPort.isAddressable()
                      data = data[port]
                    groups = (component.groupedGroups[key].splice i, 1)[0]
                    if collectGroups is true
                      groups = _.intersection.apply null, _.values groups
                    delete component.groupedData[key] if component.groupedData[key].length is 0
                    delete component.groupedGroups[key] if component.groupedGroups[key].length is 0
                    if config.group and key
                      delete component.gcTimestamps[key]
                    break
                  else
                    return # need more data to continue
              unless foundGroup
                # Create a new tuple
                obj = {}
                obj[config.field] = key if config.field
                if component.inPorts[port].isAddressable()
                  obj[port] = {} ; obj[port][index] = payload
                else
                  obj[port] = payload
                if inPorts.length is 1 and
                component.inPorts[port].isAddressable() and
                (config.arrayPolicy.in is 'any' or
                component.inPorts[port].listAttached().length is 1)
                  # This packet is all we need
                  data = obj[port]
                  groups = component.groupBuffers[port]
                else
                  component.groupedData[key].push obj
                  if needPortGroups
                    component.groupedGroups[key].push component.groupBuffers[port]
                  else if collectGroups is true
                    tmp = {} ; tmp[port] = component.groupBuffers[port]
                    component.groupedGroups[key].push tmp
                  else
                    component.groupedGroups[key].push []
                  if config.group and key
                    # Timestamp to garbage collect this request
                    component.gcTimestamps[key] = new Date().getTime()
                  return # need more data to continue

            # Drop premature data if configured to do so
            return if config.dropInput and component.completeParams.length isnt component.requiredParams.length

            # Prepare outputs
            outs = {}
            for name in outPorts
              if config.async or config.sendStreams and
              config.sendStreams.indexOf(name) isnt -1
                outs[name] = new StreamSender component.outPorts[name], config.ordered
              else
                outs[name] = component.outPorts[name]

            outs = outs[outPorts[0]] if outPorts.length is 1 # for simplicity
            groups = [] unless groups
            whenDoneGroups = groups.slice 0
            whenDone = (err) ->
              if err
                component.error err, whenDoneGroups
              # For use with MultiError trait
              if typeof component.fail is 'function' and component.hasErrors
                component.fail()
              # Disconnect outputs if still connected,
              # this also indicates them as resolved if pending
              outputs = if outPorts.length is 1 then port: outs else outs
              disconnect = false
              if component.disconnectQ.length > 0
                component.disconnectQ.shift()
                disconnect = true
              for name, out of outputs
                out.endGroup() for i in whenDoneGroups if config.forwardGroups and config.async
                out.disconnect() if disconnect
                out.done() if config.async or config.StreamSender
              if typeof component.afterProcess is 'function'
                component.afterProcess err or component.hasErrors, outs

            # Before hook
            if typeof component.beforeProcess is 'function'
              component.beforeProcess outs

            # Group forwarding
            if config.forwardGroups and config.async
              if outPorts.length is 1
                outs.beginGroup g for g in groups
              else
                for name, out of outs
                  out.beginGroup g for g in groups

            # Enforce MultiError with WirePattern (for group forwarding)
            exports.MultiError component, config.name, config.error, groups

            # Call the proc function
            if config.async
              postpone = ->
              resume = ->
              postponedToQ = false
              task = ->
                proc.call component, data, groups, outs, whenDone, postpone, resume
              postpone = (backToQueue = true) ->
                postponedToQ = backToQueue
                if backToQueue
                  component.taskQ.push task
              resume = ->
                if postponedToQ then resumeTaskQ() else task()
            else
              task = ->
                proc.call component, data, groups, outs
                whenDone()
            component.taskQ.push task
            resumeTaskQ()

            # Call the garbage collector
            gc()

  # Overload shutdown method to clean WirePattern state
  baseShutdown = component.shutdown
  component.shutdown = ->
    baseShutdown.call component
    component.groupedData = {}
    component.groupedGroups = {}
    component.outputQ = []
    component.disconnectData = {}
    component.disconnectQ = []
    component.taskQ = []
    component.params = {}
    component.completeParams = []
    component.receivedParams = []
    component.defaultsSent = false
    component.groupBuffers = {}
    component.keyBuffers = {}
    component.gcTimestamps = {}
    component.gcCounter = 0

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
exports.MultiError = (component, group = '', errorPort = 'error', forwardedGroups = []) ->
  component.hasErrors = false
  component.errors = []

  # Override component.error to support group information
  component.error = (e, groups = []) ->
    component.errors.push
      err: e
      groups: forwardedGroups.concat groups
    component.hasErrors = true

  # Fail method should be called to terminate process immediately
  # or to flush error packets.
  component.fail = (e = null, groups = []) ->
    component.error e, groups if e
    return unless component.hasErrors
    return unless errorPort of component.outPorts
    return unless component.outPorts[errorPort].isAttached()
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

  # Overload shutdown method to clear errors
  baseShutdown = component.shutdown
  component.shutdown = ->
    baseShutdown.call component
    component.hasErrors = false
    component.errors = []

  return component
