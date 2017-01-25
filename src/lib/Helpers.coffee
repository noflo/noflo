#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014-2015 TheGrid (Rituwall Inc.)
#     NoFlo may be freely distributed under the MIT license
StreamSender = require('./Streams').StreamSender
StreamReceiver = require('./Streams').StreamReceiver
InternalSocket = require './InternalSocket'
IP = require './IP'
platform = require './Platform'
utils = require './Utils'
debug = require('debug') 'noflo:helpers'

isArray = (obj) ->
  return Array.isArray(obj) if Array.isArray
  return Object.prototype.toString.call(arg) == '[object Array]'

# MapComponent maps a single inport to a single outport, forwarding all
# groups from in to out and calling `func` on each incoming packet
exports.MapComponent = (component, func, config) ->
  platform.deprecated 'noflo.helpers.MapComponent is deprecated. Please port to Process API'
  config = {} unless config
  config.inPort = 'in' unless config.inPort
  config.outPort = 'out' unless config.outPort

  # Set up bracket forwarding
  component.forwardBrackets = {} unless component.forwardBrackets
  component.forwardBrackets[config.inPort] = [config.outPort]

  component.process (input, output) ->
    return unless input.hasData config.inPort
    data = input.getData config.inPort
    groups = getGroupContext config.inPort, input
    outProxy = getOutputProxy [config.outPort], output
    func data, groups, outProxy
    output.done()

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
  if config.forwardGroups
    if typeof config.forwardGroups is 'string'
      # Collect groups from one and only port?
      config.forwardGroups = [config.forwardGroups]
    if typeof config.forwardGroups is 'boolean'
      # Forward groups from each port?
      config.forwardGroups = inPorts
  # Receive streams feature
  config.receiveStreams = false unless 'receiveStreams' of config
  if config.receiveStreams
    throw new Error 'WirePattern receiveStreams is deprecated'
  # if typeof config.receiveStreams is 'string'
  #   config.receiveStreams = [ config.receiveStreams ]
  # Send streams feature
  config.sendStreams = false unless 'sendStreams' of config
  if config.sendStreams
    throw new Error 'WirePattern sendStreams is deprecated'
  # if typeof config.sendStreams is 'string'
  #   config.sendStreams = [ config.sendStreams ]
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

  config.inPorts = inPorts
  config.outPorts = outPorts

  # If we're using deprecated WirePattern features we provide warnings on them
  # and fall back to the legacy implementation of WirePattern
  setup = if checkDeprecation config, proc then legacyWirePattern else processApiWrapper
  return setup component, config, proc

# Takes WirePattern configuration of a component and sets up
# Process API to handle it.
processApiWrapper = (component, config, func) ->
  # Make param ports control ports
  setupControlPorts component, config
  # Set up sendDefaults function
  setupSendDefaults component
  # Set up bracket forwarding rules
  setupBracketForwarding component, config
  # Create the processing function
  component.process (input, output, context) ->
    # Abort unless WirePattern-style preconditions don't match
    return unless checkWirePatternPreconditions component, config, input, output
    # Populate component.params from control ports
    component.params = populateParams config, input
    # Read input data
    data = getInputData config, input
    # Read bracket context of first inport
    groups = getGroupContext config.inPorts[0], input
    # Produce proxy object wrapping output in legacy-style port API
    outProxy = getOutputProxy config.outPorts, output

    debug "WirePattern Process API call with", data, groups, component.params, context.scope

    unless config.async
      # Set up custom error handlers
      errorHandler = setupErrorHandler component, config, output, ->
        return output.done()
      # Synchronous WirePattern, call done here
      func.call component, data, groups, outProxy, null, null, input.scope
      do errorHandler
      output.done()
      return

    # Async WirePattern will call the output.done callback itself
    errorHandler = setupErrorHandler component, config, output, ->
      output.done()
    func.call component, data, groups, outProxy, (err) ->
      do errorHandler
      output.done err
    , null, null, input.scope

# Provide deprecation warnings on certain more esoteric WirePattern features
checkDeprecation = (config, func) ->
  needsFallback = false
  # First check the conditions that force us to fall back on legacy WirePattern
  if config.group
    platform.deprecated 'noflo.helpers.WirePattern group option is deprecated. Please port to Process API'
    needsFallback = true
  if config.field
    platform.deprecated 'noflo.helpers.WirePattern field option is deprecated. Please port to Process API'
    needsFallback = true
  # Then add deprecation warnings for other unwanted behaviors
  if func.length > 4
    platform.deprecated 'noflo.helpers.WirePattern postpone and resume are deprecated. Please port to Process API'
  unless config.async
    platform.deprecated 'noflo.helpers.WirePattern synchronous is deprecated. Please port to Process API'
  return needsFallback

# Updates component port definitions to control prots for WirePattern
# -style params array
setupControlPorts = (component, config) ->
  for param in config.params
    component.inPorts[param].options.control = true

# Sets up Process API bracket forwarding rules for WirePattern configuration
setupBracketForwarding = (component, config) ->
  # Start with empty bracket forwarding config
  component.forwardBrackets = {}
  return unless config.forwardGroups
  # By default we forward from all inports
  inPorts = config.inPorts
  if isArray config.forwardGroups
    # Selective forwarding enabled
    inPorts = config.forwardGroups
  for inPort in inPorts
    component.forwardBrackets[inPort] = []
    # Forward to all declared outports
    for outPort in config.outPorts
      component.forwardBrackets[inPort].push outPort
    # If component has an error outport, forward there too
    if component.outPorts.error
      component.forwardBrackets[inPort].push 'error'
  return

setupErrorHandler = (component, config, output, failCallback) ->
  errors = []
  errorHandler = (e, groups = []) ->
    platform.deprecated 'noflo.helpers.WirePattern error method is deprecated. Please send error to callback instead'
    errors.push
      err: e
      groups: groups
    component.hasErrors = true
  failHandler = (e = null, groups = []) ->
    platform.deprecated 'noflo.helpers.WirePattern fail method is deprecated. Please send error to callback instead'
    errorHandler e, groups if e
    sendErrors()
    failCallback()

  sendErrors  = ->
    return unless errors.length
    output.sendIP 'error', new IP 'openBracket', config.name if config.name
    errors.forEach (e) ->
      output.sendIP 'error', new IP 'openBracket', grp for grp in e.groups
      output.sendIP 'error', new IP 'data', e.err
      output.sendIP 'error', new IP 'closeBracket', grp for grp in e.groups
    output.sendIP 'error', new IP 'closeBracket', config.name if config.name
    component.hasErrors = false
    errors = []

  component.hasErrors = false
  component.error = errorHandler
  component.fail = failHandler

  sendErrors

setupSendDefaults = (component) ->
  portsWithDefaults = Object.keys(component.inPorts.ports).filter (p) ->
    return false unless component.inPorts[p].options.control
    return false unless component.inPorts[p].hasDefault()
    true
  component.sendDefaults = ->
    platform.deprecated 'noflo.helpers.WirePattern sendDefaults method is deprecated. Please start with a Network'
    portsWithDefaults.forEach (port) ->
      tempSocket = InternalSocket.createSocket()
      component.inPorts[port].attach tempSocket
      tempSocket.send()
      tempSocket.disconnect()
      component.inPorts[port].detach tempSocket

populateParams = (config, input) ->
  return unless config.params.length
  params = {}
  for paramPort in config.params
    params[paramPort] = input.getData paramPort
  return params

getInputData = (config, input) ->
  data = {}
  for port in config.inPorts
    data[port] = input.getData port
  if config.inPorts.length is 1
    return data[config.inPorts[0]]
  return data

getGroupContext = (port, input) ->
  return [] unless input.result.__bracketContext?[port]?
  input.result.__bracketContext[port].filter((c) ->
    c.source is port
  ).map (c) -> c.ip.data

getOutputProxy = (ports, output) ->
  outProxy = {}
  ports.forEach (port) ->
    outProxy[port] =
      connect: ->
      beginGroup: (group) ->
        output.sendIP port, new IP 'openBracket', group
      send: (data) ->
        output.sendIP port, new IP 'data', data
      endGroup: (group) ->
        output.sendIP port, new IP 'closeBracket', group
      disconnect: ->
  if ports.length is 1
    return outProxy[ports[0]]
  return outProxy

checkWirePatternPreconditions = (component, config, input, output) ->
  # First check for required params
  paramsMet = true
  inputsMet = true
  droppedPackets = false
  for param in config.params
    continue unless component.inPorts[param].isRequired()
    paramsMet = false unless input.hasData param
  # Then check actual input ports
  for port in config.inPorts
    unless input.hasData port
      inputsMet = false
      continue
    # If input port has data but param requirements are not
    # met, and we're in dropInput mode, read the data and
    # call done
    if config.dropInput and not paramsMet
      input.getData port
      droppedPackets = true

  output.done() if droppedPackets and not paramsMet
  return inputsMet and paramsMet

# Wraps OutPort in WirePattern to add transparent scope support
class OutPortWrapper
  constructor: (@port, @scope) ->
  connect: (socketId = null) ->
    @port.openBracket null, scope: @scope, socketId
  beginGroup: (group, socketId = null) ->
    @port.openBracket group, scope: @scope, socketId
  send: (data, socketId = null) ->
    @port.sendIP 'data', data, scope: @scope, socketId, false
  endGroup: (group, socketId = null) ->
    @port.closeBracket group, scope: @scope, socketId
  disconnect: (socketId = null) ->
    @endGroup socketId
  isConnected: -> @port.isConnected()
  isAttached: -> @port.isAttached()

# Legacy WirePattern implementation. We fall back to this with
# some deprecated parameters.
legacyWirePattern = (component, config, proc) ->
  # Garbage collector frequency: execute every N packets
  config.gcFrequency = 100 unless 'gcFrequency' of config
  # Garbage collector timeout: drop packets older than N seconds
  config.gcTimeout = 300 unless 'gcTimeout' of config

  collectGroups = config.forwardGroups
  # Collect groups from any port, as we group by them
  if collectGroups isnt false and config.group
    collectGroups = true

  for name in config.inPorts
    unless component.inPorts[name]
      throw new Error "no inPort named '#{name}'"
  for name in config.outPorts
    unless component.outPorts[name]
      throw new Error "no outPort named '#{name}'"

  disconnectOuts = ->
    # Manual disconnect forwarding
    for p in config.outPorts
      component.outPorts[p].disconnect() if component.outPorts[p].isConnected()

  sendGroupToOuts = (grp) ->
    for p in config.outPorts
      component.outPorts[p].beginGroup grp

  closeGroupOnOuts = (grp) ->
    for p in config.outPorts
      component.outPorts[p].endGroup grp

  # Declarations
  component.requiredParams = []
  component.defaultedParams = []
  component.gcCounter = 0
  component._wpData = {}
  _wp = (scope) ->
    unless scope of component._wpData
      component._wpData[scope] = {}
      # Input grouping
      component._wpData[scope].groupedData = {}
      component._wpData[scope].groupedGroups = {}
      component._wpData[scope].groupedDisconnects = {}

      # Params and queues
      component._wpData[scope].outputQ = []
      component._wpData[scope].taskQ = []
      component._wpData[scope].params = {}
      component._wpData[scope].completeParams = []
      component._wpData[scope].receivedParams = []
      component._wpData[scope].defaultsSent = false

      # Disconnect event forwarding
      component._wpData[scope].disconnectData = {}
      component._wpData[scope].disconnectQ = []

      # GC and rest
      component._wpData[scope].groupBuffers = {}
      component._wpData[scope].keyBuffers = {}
      component._wpData[scope].gcTimestamps = {}
    component._wpData[scope]
  component.params = {}
  setParamsScope = (scope) ->
    component.params = _wp(scope).params

  # For ordered output
  processQueue = (scope) ->
    while _wp(scope).outputQ.length > 0
      streams = _wp(scope).outputQ[0]
      flushed = false
      # Null in the queue means "disconnect all"
      if streams is null
        disconnectOuts()
        flushed = true
      else
        # At least one of the outputs has to be resolved
        # for output streams to be flushed.
        if config.outPorts.length is 1
          tmp = {}
          tmp[config.outPorts[0]] = streams
          streams = tmp
        for key, stream of streams
          if stream.resolved
            stream.flush()
            flushed = true
      _wp(scope).outputQ.shift() if flushed
      return unless flushed

  if config.async
    component.load = 0 if 'load' of component.outPorts
    # Create before and after hooks
    component.beforeProcess = (scope, outs) ->
      _wp(scope).outputQ.push outs if config.ordered
      component.load++
      component.emit 'activate', component.load
      if 'load' of component.outPorts and component.outPorts.load.isAttached()
        component.outPorts.load.send component.load
        component.outPorts.load.disconnect()
    component.afterProcess = (scope, err, outs) ->
      processQueue scope
      component.load--
      if 'load' of component.outPorts and component.outPorts.load.isAttached()
        component.outPorts.load.send component.load
        component.outPorts.load.disconnect()
      component.emit 'deactivate', component.load

  component.sendDefaults = (scope) ->
    if component.defaultedParams.length > 0
      for param in component.defaultedParams
        if _wp(scope).receivedParams.indexOf(param) is -1
          tempSocket = InternalSocket.createSocket()
          component.inPorts[param].attach tempSocket
          tempSocket.send()
          tempSocket.disconnect()
          component.inPorts[param].detach tempSocket
    _wp(scope).defaultsSent = true

  resumeTaskQ = (scope) ->
    if _wp(scope).completeParams.length is component.requiredParams.length and
    _wp(scope).taskQ.length > 0
      # Avoid looping when feeding the queue inside the queue itself
      temp = _wp(scope).taskQ.slice 0
      _wp(scope).taskQ = []
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
      inPort.handle = (ip) ->
        event = ip.type
        payload = ip.data
        scope = ip.scope
        index = ip.index
        # Param ports only react on data
        return unless event is 'data'
        if inPort.isAddressable()
          _wp(scope).params[port] = {} unless port of _wp(scope).params
          _wp(scope).params[port][index] = payload
          if config.arrayPolicy.params is 'all' and
          Object.keys(_wp(scope).params[port]).length < inPort.listAttached().length
            return # Need data on all array indexes to proceed
        else
          _wp(scope).params[port] = payload
        if _wp(scope).completeParams.indexOf(port) is -1 and
        component.requiredParams.indexOf(port) > -1
          _wp(scope).completeParams.push port
        _wp(scope).receivedParams.push port
        # Trigger pending procs if all params are complete
        resumeTaskQ scope

  # Garbage collector
  component.dropRequest = (scope, key) ->
    # Discard pending disconnect keys
    delete _wp(scope).disconnectData[key] if key of _wp(scope).disconnectData
    # Clean grouped data
    delete _wp(scope).groupedData[key] if key of _wp(scope).groupedData
    delete _wp(scope).groupedGroups[key] if key of _wp(scope).groupedGroups

  gc = ->
    component.gcCounter++
    if component.gcCounter % config.gcFrequency is 0
      for scope in Object.keys(component._wpData)
        current = new Date().getTime()
        for key, val of _wp(scope).gcTimestamps
          if (current - val) > (config.gcTimeout * 1000)
            component.dropRequest scope, key
            delete _wp(scope).gcTimestamps[key]

  # Grouped ports
  for port in config.inPorts
    do (port) ->
      # Support for StreamReceiver ports
      # if config.receiveStreams and config.receiveStreams.indexOf(port) isnt -1
      #   inPort = new StreamReceiver component.inPorts[port]
      inPort = component.inPorts[port]

      needPortGroups = collectGroups instanceof Array and collectGroups.indexOf(port) isnt -1

      # Set processing callback
      inPort.handle = (ip) ->
        index = ip.index
        payload = ip.data
        scope = ip.scope
        _wp(scope).groupBuffers[port] = [] unless port of _wp(scope).groupBuffers
        _wp(scope).keyBuffers[port] = null unless port of _wp(scope).keyBuffers
        switch ip.type
          when 'openBracket'
            return if payload is null
            _wp(scope).groupBuffers[port].push payload
            if config.forwardGroups and (collectGroups is true or needPortGroups) and not config.async
              sendGroupToOuts payload
          when 'closeBracket'
            _wp(scope).groupBuffers[port] = _wp(scope).groupBuffers[port].slice 0, _wp(scope).groupBuffers[port].length - 1
            if config.forwardGroups and (collectGroups is true or needPortGroups) and not config.async
              # FIXME probably need to skip this if payload is null
              closeGroupOnOuts payload
            # Disconnect
            if _wp(scope).groupBuffers[port].length is 0
              if config.inPorts.length is 1
                if config.async or config.StreamSender
                  if config.ordered
                    _wp(scope).outputQ.push null
                    processQueue scope
                  else
                    _wp(scope).disconnectQ.push true
                else
                  disconnectOuts()
              else
                foundGroup = false
                key = _wp(scope).keyBuffers[port]
                _wp(scope).disconnectData[key] = [] unless key of _wp(scope).disconnectData
                for i in [0..._wp(scope).disconnectData[key].length]
                  unless port of _wp(scope).disconnectData[key][i]
                    foundGroup = true
                    _wp(scope).disconnectData[key][i][port] = true
                    if Object.keys(_wp(scope).disconnectData[key][i]).length is config.inPorts.length
                      _wp(scope).disconnectData[key].shift()
                      if config.async or config.StreamSender
                        if config.ordered
                          _wp(scope).outputQ.push null
                          processQueue scope
                        else
                          _wp(scope).disconnectQ.push true
                      else
                        disconnectOuts()
                      delete _wp(scope).disconnectData[key] if _wp(scope).disconnectData[key].length is 0
                    break
                unless foundGroup
                  obj = {}
                  obj[port] = true
                  _wp(scope).disconnectData[key].push obj

          when 'data'
            if config.inPorts.length is 1 and not inPort.isAddressable()
              data = payload
              groups = _wp(scope).groupBuffers[port]
            else
              key = ''
              if config.group and _wp(scope).groupBuffers[port].length > 0
                key = _wp(scope).groupBuffers[port].toString()
                if config.group instanceof RegExp
                  reqId = null
                  for grp in _wp(scope).groupBuffers[port]
                    if config.group.test grp
                      reqId = grp
                      break
                  key = if reqId then reqId else ''
              else if config.field and typeof(payload) is 'object' and
              config.field of payload
                key = payload[config.field]
              _wp(scope).keyBuffers[port] = key
              _wp(scope).groupedData[key] = [] unless key of _wp(scope).groupedData
              _wp(scope).groupedGroups[key] = [] unless key of _wp(scope).groupedGroups
              foundGroup = false
              requiredLength = config.inPorts.length
              ++requiredLength if config.field
              # Check buffered tuples awaiting completion
              for i in [0..._wp(scope).groupedData[key].length]
                # Check this buffered tuple if it's missing value for this port
                if not (port of _wp(scope).groupedData[key][i]) or
                (component.inPorts[port].isAddressable() and
                config.arrayPolicy.in is 'all' and
                not (index of _wp(scope).groupedData[key][i][port]))
                  foundGroup = true
                  if component.inPorts[port].isAddressable()
                    # Maintain indexes for addressable ports
                    unless port of _wp(scope).groupedData[key][i]
                      _wp(scope).groupedData[key][i][port] = {}
                    _wp(scope).groupedData[key][i][port][index] = payload
                  else
                    _wp(scope).groupedData[key][i][port] = payload
                  if needPortGroups
                    # Include port groups into the set of the unique ones
                    _wp(scope).groupedGroups[key][i] = utils.unique [_wp(scope).groupedGroups[key][i]..., _wp(scope).groupBuffers[port]...]
                  else if collectGroups is true
                    # All the groups we need are here in this port
                    _wp(scope).groupedGroups[key][i][port] = _wp(scope).groupBuffers[port]
                  # Addressable ports may require other indexes
                  if component.inPorts[port].isAddressable() and
                  config.arrayPolicy.in is 'all' and
                  Object.keys(_wp(scope).groupedData[key][i][port]).length <
                  component.inPorts[port].listAttached().length
                    return # Need data on other array port indexes to arrive

                  groupLength = Object.keys(_wp(scope).groupedData[key][i]).length
                  # Check if the tuple is complete
                  if groupLength is requiredLength
                    data = (_wp(scope).groupedData[key].splice i, 1)[0]
                    # Strip port name if there's only one inport
                    if config.inPorts.length is 1 and inPort.isAddressable()
                      data = data[port]
                    groups = (_wp(scope).groupedGroups[key].splice i, 1)[0]
                    if collectGroups is true
                      groups = utils.intersection.apply null, utils.getValues groups
                    delete _wp(scope).groupedData[key] if _wp(scope).groupedData[key].length is 0
                    delete _wp(scope).groupedGroups[key] if _wp(scope).groupedGroups[key].length is 0
                    if config.group and key
                      delete _wp(scope).gcTimestamps[key]
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
                if config.inPorts.length is 1 and
                component.inPorts[port].isAddressable() and
                (config.arrayPolicy.in is 'any' or
                component.inPorts[port].listAttached().length is 1)
                  # This packet is all we need
                  data = obj[port]
                  groups = _wp(scope).groupBuffers[port]
                else
                  _wp(scope).groupedData[key].push obj
                  if needPortGroups
                    _wp(scope).groupedGroups[key].push _wp(scope).groupBuffers[port]
                  else if collectGroups is true
                    tmp = {} ; tmp[port] = _wp(scope).groupBuffers[port]
                    _wp(scope).groupedGroups[key].push tmp
                  else
                    _wp(scope).groupedGroups[key].push []
                  if config.group and key
                    # Timestamp to garbage collect this request
                    _wp(scope).gcTimestamps[key] = new Date().getTime()
                  return # need more data to continue

            # Drop premature data if configured to do so
            return if config.dropInput and _wp(scope).completeParams.length isnt component.requiredParams.length

            # Prepare outputs
            outs = {}
            for name in config.outPorts
              wrp = new OutPortWrapper component.outPorts[name], scope
              if config.async or config.sendStreams and
              config.sendStreams.indexOf(name) isnt -1
                wrp
                outs[name] = new StreamSender wrp, config.ordered
              else
                outs[name] = wrp

            outs = outs[config.outPorts[0]] if config.outPorts.length is 1 # for simplicity
            groups = [] unless groups
            # Filter empty connect/disconnect groups
            groups = (g for g in groups when g isnt null)
            whenDoneGroups = groups.slice 0
            whenDone = (err) ->
              if err
                component.error err, whenDoneGroups, 'error', scope
              # For use with MultiError trait
              if typeof component.fail is 'function' and component.hasErrors
                component.fail null, [], scope
              # Disconnect outputs if still connected,
              # this also indicates them as resolved if pending
              outputs = outs
              if config.outPorts.length is 1
                outputs = {}
                outputs[port] = outs
              disconnect = false
              if _wp(scope).disconnectQ.length > 0
                _wp(scope).disconnectQ.shift()
                disconnect = true
              for name, out of outputs
                out.endGroup() for i in whenDoneGroups if config.forwardGroups and config.async
                out.disconnect() if disconnect
                out.done() if config.async or config.StreamSender
              if typeof component.afterProcess is 'function'
                component.afterProcess scope, err or component.hasErrors, outs

            # Before hook
            if typeof component.beforeProcess is 'function'
              component.beforeProcess scope, outs

            # Group forwarding
            if config.forwardGroups and config.async
              if config.outPorts.length is 1
                outs.beginGroup g for g in groups
              else
                for name, out of outs
                  out.beginGroup g for g in groups

            # Enforce MultiError with WirePattern (for group forwarding)
            exports.MultiError component, config.name, config.error, groups, scope

            debug "WirePattern with", data, groups, component.params, scope

            # Call the proc function
            if config.async
              postpone = ->
              resume = ->
              postponedToQ = false
              task = ->
                setParamsScope scope
                proc.call component, data, groups, outs, whenDone, postpone, resume, scope
              postpone = (backToQueue = true) ->
                postponedToQ = backToQueue
                if backToQueue
                  _wp(scope).taskQ.push task
              resume = ->
                if postponedToQ then resumeTaskQ() else task()
            else
              task = ->
                setParamsScope scope
                proc.call component, data, groups, outs, null, null, null, scope
                whenDone()
            _wp(scope).taskQ.push task
            resumeTaskQ scope

            # Call the garbage collector
            gc()

  # Overload tearDown method to clean WirePattern state
  baseTearDown = component.tearDown
  component.tearDown = (callback) ->
    component.requiredParams = []
    component.defaultedParams = []
    component.gcCounter = 0
    component._wpData = {}
    component.params = {}
    baseTearDown.call component, callback

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
exports.MultiError = (component, group = '', errorPort = 'error', forwardedGroups = [], scope = null) ->
  platform.deprecated 'noflo.helpers.MultiError is deprecated. Send errors to error port instead'
  component.hasErrors = false
  component.errors = []
  group = component.name if component.name and not group
  group = 'Component' unless group

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
    component.outPorts[errorPort].openBracket group, scope: scope if group
    for error in component.errors
      component.outPorts[errorPort].openBracket grp, scope: scope for grp in error.groups
      component.outPorts[errorPort].data error.err, scope: scope
      component.outPorts[errorPort].closeBracket grp, scope: scope for grp in error.groups
    component.outPorts[errorPort].closeBracket group, scope: scope if group
    # component.outPorts[errorPort].disconnect()
    # Clean the status for next activation
    component.hasErrors = false
    component.errors = []

  # Overload shutdown method to clear errors
  baseTearDown = component.tearDown
  component.tearDown = (callback) ->
    component.hasErrors = false
    component.errors = []
    baseTearDown.call component, callback

  return component
