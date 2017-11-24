#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014-2017 Flowhub UG
#     NoFlo may be freely distributed under the MIT license
InternalSocket = require './InternalSocket'
IP = require './IP'
platform = require './Platform'
utils = require './Utils'
debug = require('debug') 'noflo:helpers'

# ## NoFlo WirePattern helper
#
# **Note:** WirePattern is no longer the recommended way to build
# NoFlo components. Please use [Process API](https://noflojs.org/documentation/components/) instead.
#
# WirePattern makes your component collect data from several inports
# and activates a handler `proc` only when a tuple from all of these
# ports is complete. The signature of handler function is:
# ```
# proc = (combinedInputData, inputGroups, outputPorts, asyncCallback) ->
# ```
#
# With `config.forwardGroups = true` it would forward group IPs from
# inputs to the output sending them along with the data. This option also
# accepts string or array values, if you want to forward groups from specific
# port(s) only. By default group forwarding is `false`.
#
# substream cannot be interrupted by other packets, which is important when
# doing asynchronous processing. In fact, `sendStreams` is enabled by default
# on all outports when `config.async` is `true`.
#
# WirePattern supports async `proc` handlers. Set `config.async = true` and
# make sure that `proc` accepts callback as 4th parameter and calls it when
# async operation completes or fails.
exports.WirePattern = (component, config, proc) ->
  # In ports
  inPorts = if 'in' of config then config.in else 'in'
  inPorts = [ inPorts ] unless utils.isArray inPorts
  # Out ports
  outPorts = if 'out' of config then config.out else 'out'
  outPorts = [ outPorts ] unless utils.isArray outPorts
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
  # Warn user of deprecated features
  checkDeprecation config, proc
  # Allow users to selectively fall back to legacy WirePattern implementation
  if config.legacy or process?.env?.NOFLO_WIREPATTERN_LEGACY
    platform.deprecated 'noflo.helpers.WirePattern legacy mode is deprecated'
  return processApiWirePattern component, config, proc

# Takes WirePattern configuration of a component and sets up
# Process API to handle it.
processApiWirePattern = (component, config, func) ->
  # Make param ports control ports
  setupControlPorts component, config
  # Set up sendDefaults function
  setupSendDefaults component
  # Set up bracket forwarding rules
  setupBracketForwarding component, config
  component.ordered = config.ordered
  # Create the processing function
  component.process (input, output, context) ->
    # Abort unless WirePattern-style preconditions don't match
    return unless checkWirePatternPreconditions config, input, output
    # Populate component.params from control ports
    component.params = populateParams config, input
    # Read input data
    data = getInputData config, input
    # Read bracket context of first inport
    groups = getGroupContext component, config.inPorts[0], input
    # Produce proxy object wrapping output in legacy-style port API
    outProxy = getOutputProxy config.outPorts, output

    debug "WirePattern Process API call with", data, groups, component.params, context.scope

    postpone = ->
      throw new Error 'noflo.helpers.WirePattern postpone is deprecated'
    resume = ->
      throw new Error 'noflo.helpers.WirePattern resume is deprecated'

    # Async WirePattern will call the output.done callback itself
    errorHandler = setupErrorHandler component, config, output
    func.call component, data, groups, outProxy, (err) ->
      do errorHandler
      output.done err
    , postpone, resume, input.scope

# Provide deprecation warnings on certain more esoteric WirePattern features
checkDeprecation = (config, func) ->
  # First check the conditions that force us to fall back on legacy WirePattern
  if config.group
    platform.deprecated 'noflo.helpers.WirePattern group option is deprecated. Please port to Process API'
  if config.field
    platform.deprecated 'noflo.helpers.WirePattern field option is deprecated. Please port to Process API'
  # Then add deprecation warnings for other unwanted behaviors
  if func.length > 4
    platform.deprecated 'noflo.helpers.WirePattern postpone and resume are deprecated. Please port to Process API'
  unless config.async
    throw new Error 'noflo.helpers.WirePattern synchronous is deprecated. Please use async: true'
  if func.length < 4
    throw new Error 'noflo.helpers.WirePattern callback doesn\'t use callback argument'
  unless config.error is 'error'
    platform.deprecated 'noflo.helpers.WirePattern custom error port name is deprecated. Please switch to "error" or port to WirePattern'
  return

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
  if utils.isArray config.forwardGroups
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

setupErrorHandler = (component, config, output) ->
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
    output.done()

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
  return {} unless config.params.length
  params = {}
  for paramPort in config.params
    if input.ports[paramPort].isAddressable()
      params[paramPort] = {}
      for idx in input.attached paramPort
        continue unless input.hasData [paramPort, idx]
        params[paramPort][idx] = input.getData [paramPort, idx]
      continue
    params[paramPort] = input.getData paramPort
  return params

reorderBuffer = (buffer, matcher) ->
  # Move matching IP packet to be first in buffer
  #
  # Note: the collation mechanism as shown below is not a
  # very nice way to deal with inputs as it messes with
  # input buffer order. Much better to handle collation
  # in a specialized component or to separate flows by
  # scope.
  #
  # The trick here is to order the input in a way that
  # still allows bracket forwarding to work. So if we
  # want to first process packet B in stream like:
  #
  #     < 1
  #     < 2
  #     A
  #     > 2
  #     < 3
  #     B
  #     > 3
  #     > 1
  #
  # We need to change the stream to be like:
  #
  #     < 1
  #     < 3
  #     B
  #     > 3
  #     < 2
  #     A
  #     > 2
  #     > 1
  substream = null
  brackets = []
  substreamBrackets = []
  for ip, idx in buffer
    if ip.type is 'openBracket'
      brackets.push ip.data
      substreamBrackets.push ip
      continue
    if ip.type is 'closeBracket'
      brackets.pop()
      substream.push ip if substream
      substreamBrackets.pop() if substreamBrackets.length
      break if substream and not substreamBrackets.length
      continue
    unless matcher ip, brackets
      # Reset substream bracket tracking when we hit data
      substreamBrackets = []
      continue
    # Match found, start tracking the actual substream
    substream = substreamBrackets.slice 0
    substream.push ip
  # See where in the buffer the matching substream begins
  substreamIdx = buffer.indexOf substream[0]
  # No need to reorder if matching packet is already first
  return if substreamIdx is 0
  # Remove substream from its natural position
  buffer.splice substreamIdx, substream.length
  # Place the substream in the beginning
  substream.reverse()
  buffer.unshift ip for ip in substream

handleInputCollation = (data, config, input, port, idx) ->
  return if not config.group and not config.field
  if config.group
    buf = input.ports[port].getBuffer input.scope, idx
    reorderBuffer buf, (ip, brackets) ->
      for grp, idx in input.collatedBy.brackets
        return false unless brackets[idx] is grp
      true

  if config.field
    data[config.field] = input.collatedBy.field
    buf = input.ports[port].getBuffer input.scope, idx
    reorderBuffer buf, (ip) ->
      ip.data[config.field] is data[config.field]

getInputData = (config, input) ->
  data = {}
  for port in config.inPorts
    if input.ports[port].isAddressable()
      data[port] = {}
      for idx in input.attached port
        continue unless input.hasData [port, idx]
        handleInputCollation data, config, input, port, idx
        data[port][idx] = input.getData [port, idx]
      continue
    continue unless input.hasData port
    handleInputCollation data, config, input, port
    data[port] = input.getData port
  if config.inPorts.length is 1
    return data[config.inPorts[0]]
  return data

getGroupContext = (component, port, input) ->
  return [] unless input.result.__bracketContext?[port]?
  return input.collatedBy.brackets if input.collatedBy?.brackets
  input.result.__bracketContext[port].filter((c) ->
    c.source is port
  ).map (c) -> c.ip.data

getOutputProxy = (ports, output) ->
  outProxy = {}
  ports.forEach (port) ->
    outProxy[port] =
      connect: ->
      beginGroup: (group, idx) ->
        ip = new IP 'openBracket', group
        ip.index = idx
        output.sendIP port, ip
      send: (data, idx) ->
        ip = new IP 'data', data
        ip.index = idx
        output.sendIP port, ip
      endGroup: (group, idx) ->
        ip = new IP 'closeBracket', group
        ip.index = idx
        output.sendIP port, ip
      disconnect: ->
  if ports.length is 1
    return outProxy[ports[0]]
  return outProxy

checkWirePatternPreconditions = (config, input, output) ->
  # First check for required params
  paramsOk = checkWirePatternPreconditionsParams config, input
  # Then check actual input ports
  inputsOk = checkWirePatternPreconditionsInput config, input
  # If input port has data but param requirements are not met, and we're in dropInput
  # mode, read the data and call done
  if config.dropInput and not paramsOk
    # Drop all received input packets since params are not available
    packetsDropped = false
    for port in config.inPorts
      if input.ports[port].isAddressable()
        attached = input.attached port
        continue unless attached.length
        for idx in attached
          while input.has [port, idx]
            packetsDropped = true
            input.get([port, idx]).drop()
        continue
      while input.has port
        packetsDropped = true
        input.get(port).drop()
    # If we ended up dropping inputs because of missing params, we need to
    # deactivate here
    output.done() if packetsDropped
  # Pass precondition check only if both params and inputs are OK
  return inputsOk and paramsOk

checkWirePatternPreconditionsParams = (config, input) ->
  for param in config.params
    continue unless input.ports[param].isRequired()
    if input.ports[param].isAddressable()
      attached = input.attached param
      return false unless attached.length
      withData = attached.filter (idx) -> input.hasData [param, idx]
      if config.arrayPolicy.params is 'all'
        return false unless withData.length is attached.length
        continue
      return false unless withData.length
      continue
    return false unless input.hasData param
  true

checkWirePatternPreconditionsInput = (config, input) ->
  if config.group
    bracketsAtPorts = {}
    input.collatedBy =
      brackets: []
      ready: false
    checkBrackets = (left, right) ->
      for bracket, idx in left
        return false unless right[idx] is bracket
      true
    checkPacket = (ip, brackets) ->
      # With data packets we validate bracket matching
      bracketsToCheck = brackets.slice 0
      if config.group instanceof RegExp
        # Basic regexp validation for the brackets
        bracketsToCheck = bracketsToCheck.slice 0, 1
        return false unless bracketsToCheck.length
        return false unless config.group.test bracketsToCheck[0]

      if input.collatedBy.ready
        # We already know what brackets we're looking for, match
        return checkBrackets input.collatedBy.brackets, bracketsToCheck

      bracketId = bracketsToCheck.join ':'
      bracketsAtPorts[bracketId] = [] unless bracketsAtPorts[bracketId]
      if bracketsAtPorts[bracketId].indexOf(port) is -1
        # Register that this port had these brackets
        bracketsAtPorts[bracketId].push port

      # To prevent deadlocks we see all bracket sets, and validate if at least
      # one of them matches. This means we return true until the last inport
      # where we actually check.
      return true unless config.inPorts.indexOf(port) is config.inPorts.length - 1

      # Brackets that are not in every port are invalid
      return false unless bracketsAtPorts[bracketId].length is config.inPorts.length
      return false if input.collatedBy.ready
      input.collatedBy.ready = true
      input.collatedBy.brackets = bracketsToCheck
      true

  if config.field
    input.collatedBy =
      field: undefined
      ready: false

  checkPort = (port) ->
    # Without collation rules any data packet is OK
    return input.hasData port if not config.group and not config.field

    # With collation rules set we need can only work when we have full
    # streams
    if config.group
      portBrackets = []
      dataBrackets = []
      hasMatching = false
      buf = input.ports[port].getBuffer input.scope
      for ip in buf
        if ip.type is 'openBracket'
          portBrackets.push ip.data
          continue
        if ip.type is 'closeBracket'
          portBrackets.pop()
          continue if portBrackets.length
          continue unless hasData
          hasMatching = true
          continue
        hasData = checkPacket ip, portBrackets
        continue
      return hasMatching

    if config.field
      return input.hasStream port, (ip) ->
        # Use first data packet to define what to collate by
        unless input.collatedBy.ready
          input.collatedBy.field = ip.data[config.field]
          input.collatedBy.ready = true
          return true
        return ip.data[config.field] is input.collatedBy.field

  for port in config.inPorts
    if input.ports[port].isAddressable()
      attached = input.attached port
      return false unless attached.length
      withData = attached.filter (idx) -> checkPort [port, idx]
      if config.arrayPolicy['in'] is 'all'
        return false unless withData.length is attached.length
        continue
      return false unless withData.length
      continue
    return false unless checkPort port
  true

# `CustomError` returns an `Error` object carrying additional properties.
exports.CustomError = (message, options) ->
  err = new Error message
  return exports.CustomizeError err, options

# `CustomizeError` sets additional options for an `Error` object.
exports.CustomizeError = (err, options) ->
  for own key, val of options
    err[key] = val
  return err
