#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2016 TheGrid (Rituwall Inc.)
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# Baseclass for regular NoFlo components.
{EventEmitter} = require 'events'

ports = require './Ports'
IP = require './IP'

debug = require('debug') 'noflo:component'

class Component extends EventEmitter
  description: ''
  icon: null

  constructor: (options) ->
    options = {} unless options
    options.inPorts = {} unless options.inPorts
    if options.inPorts instanceof ports.InPorts
      @inPorts = options.inPorts
    else
      @inPorts = new ports.InPorts options.inPorts

    options.outPorts = {} unless options.outPorts
    if options.outPorts instanceof ports.OutPorts
      @outPorts = options.outPorts
    else
      @outPorts = new ports.OutPorts options.outPorts

    @icon = options.icon if options.icon
    @description = options.description if options.description

    @started = false
    @load = 0
    @ordered = options.ordered ? false
    @autoOrdering = options.autoOrdering ? null
    @outputQ = []
    @bracketContext = {}
    @activateOnInput = options.activateOnInput ? true
    @forwardBrackets = in: ['out', 'error']

    if 'forwardBrackets' of options
      @forwardBrackets = options.forwardBrackets

    if typeof options.process is 'function'
      @process options.process

  getDescription: -> @description

  isReady: -> true

  isSubgraph: -> false

  setIcon: (@icon) ->
    @emit 'icon', @icon
  getIcon: -> @icon

  error: (e, groups = [], errorPort = 'error', scope = null) =>
    if @outPorts[errorPort] and (@outPorts[errorPort].isAttached() or not @outPorts[errorPort].isRequired())
      @outPorts[errorPort].openBracket group, scope: scope for group in groups
      @outPorts[errorPort].data e, scope: scope
      @outPorts[errorPort].closeBracket group, scope: scope for group in groups
      # @outPorts[errorPort].disconnect()
      return
    throw e

  shutdown: ->
    @started = false

  # The startup function performs initialization for the component.
  start: ->
    @started = true
    @started

  isStarted: -> @started

  # Ensures braket forwarding map is correct for the existing ports
  prepareForwarding: ->
    for inPort, outPorts of @forwardBrackets
      unless inPort of @inPorts.ports
        delete @forwardBrackets[inPort]
        continue
      tmp = []
      for outPort in outPorts
        tmp.push outPort if outPort of @outPorts.ports
      if tmp.length is 0
        delete @forwardBrackets[inPort]
      else
        @forwardBrackets[inPort] = tmp

  # Sets process handler function
  process: (handle) ->
    unless typeof handle is 'function'
      throw new Error "Process handler must be a function"
    unless @inPorts
      throw new Error "Component ports must be defined before process function"
    @prepareForwarding()
    @handle = handle
    for name, port of @inPorts.ports
      do (name, port) =>
        port.name = name unless port.name
        port.on 'ip', (ip) =>
          @handleIP ip, port
    @

  isForwardingInport: (port) ->
    if typeof port is 'string'
      portName = port
    else
      portName = port.name
    if portName of @forwardBrackets
      return true
    false

  isForwardingOutport: (outport) ->
    if typeof outport is 'string'
      outportName = outport
    else
      outportName = outport.name
    for inport, outports of @forwardBrackets
      return true if outports.indexOf(outportName) isnt -1
    false

  isOrdered: ->
    return true if @ordered
    return true if @autoOrdering
    false

  # The component has received an Information Packet. Call the processing function
  # so that firing pattern preconditions can be checked and component can do
  # processing as needed.
  handleIP: (ip, port) ->
    unless port.options.triggering
      # If port is non-triggering, we can skip the process function call
      return

    if ip.type is 'openBracket'
      # Prepare bracket context for packet scope as needed
      @bracketContext[ip.scope] = [] unless @bracketContext[ip.scope]

      # Initialize the context for this bracket
      context =
        ip: ip
        ports: []
      @bracketContext[ip.scope].push context

      if @bracketContext[ip.scope].length is 1 and @autoOrdering is null
        # Switch component to ordered mode when receiving a stream unless
        # auto-ordering is disabled
        debug "#{@nodeId} port #{port.name} entered auto-ordering mode"
        @autoOrdering = true

    if ip.type is 'closeBracket' and @isOrdered()
      # Clear this scope
      context = @bracketContext[ip.scope].pop()
      context.closeIp = ip
      result =
        __resolved: true
        __closeBracketContext: context
      @outputQ.push result
      do @processOutputQueue

    if @isForwardingInport(port) and ip.type in ['openBracket', 'closeBracket']
      # Bracket forwarding enabled on port. In this case we don't call processing
      # functions on brackets, only on data.
      return

    bracketContext = if @bracketContext[ip.scope] then @bracketContext[ip.scope].slice(0) else []
    result =
      __bracketContext: bracketContext
    # Prepare the input/output pair
    input = new ProcessInput @inPorts, ip, @, port, result
    output = new ProcessOutput @outPorts, ip, @, result
    # Call the processing function
    @handle input, output, -> output.done()

    unless input.activated
      debug "#{@nodeId} #{ip.type} packet on #{port.name} didn't match preconditions"
      return

    # Component fired
    if @isOrdered()
      # Ordered mode. Instead of sending directly, we're queueing
      @outputQ.push result
      do @processOutputQueue
    return

  addBracketForwards: (result) ->
    # First see if there are any brackets to forward
    return unless result.__bracketContext
    for outport, ips of result
      continue if outport.indexOf('__') is 0
      continue unless @isForwardingOutport outport
      unforwarded = result.__bracketContext.filter (ctx) ->
        ctx.ports.indexOf(outport) is -1
      continue unless unforwarded.length
      unforwarded.reverse()
      for ctx in unforwarded
        ips.unshift ctx.ip.clone()
        debug "#{@nodeId} forwarding #{ctx.ip.type} to #{outport}"
        ctx.ports.push outport

  processOutputQueue: ->
    while @outputQ.length > 0
      result = @outputQ[0]
      break unless result.__resolved

      if result.__closeBracketContext
        # Handle closing bracket forwarding
        for outport in result.__closeBracketContext.ports
          debug "#{@nodeId} forwarding closeBracket to #{outport}"
          result[outport] = [result.__closeBracketContext.closeIp.clone()]
        delete result.__closeBracketContext

      for port, ips of result
        continue if port.indexOf('__') is 0
        continue unless @outPorts.ports[port].isAttached()
        @addBracketForwards result
        for ip in ips
          @outPorts[port].sendIP ip
      @outputQ.shift()

exports.Component = Component

class ProcessInput
  constructor: (@ports, @ip, @nodeInstance, @port, @result) ->
    @scope = @ip.scope
    @buffer = new PortBuffer(@)
    @activated = false

  # Preconditions met, set component state to `activated`
  activate: ->
    return if @activated
    @nodeInstance.load++
    debug "#{@nodeInstance.nodeId} #{@ip.type} packet on #{@port.name} caused activation #{@nodeInstance.load}"
    @activated = true

    if @nodeInstance.isOrdered()
      # We're handling packets in order. Set the result as non-resolved so that it can
      # be send when the order comes up
      @result.__resolved = false

  # ## Input preconditions
  # When the processing function is called, it can check if input buffers
  # contain the packets needed for the process to fire.
  # This precondition handling is done via the `has` and `hasStream` methods.

  # Returns true if a port (or ports joined by logical AND) has a new IP
  # Passing a validation callback as a last argument allows more selective
  # checking of packets.
  has: (args...) ->
    args = ['in'] unless args.length
    if typeof args[args.length - 1] is 'function'
      validate = args.pop()
      for port in args
        return false unless @ports[port].has @scope, validate
      return true
    res = true
    res and= @ports[port].ready @scope for port in args
    res

  # Returns true if a port has a complete stream in its input buffer.
  hasStream: (port) ->
    buffer = @buffer.get port
    return false if buffer.length is 0
    # check if we have everything until end of a complete stream
    received = 0
    for packet in buffer
      if packet.type is 'openBracket'
        ++received
      else if packet.type is 'closeBracket'
        --received
    received is 0

  # ## Input processing
  #
  # Once preconditions have been met, the processing function can read from
  # the input buffers. Reading packets sets the component as "activated".
  #
  # Fetches IP object(s) for port(s)
  get: (args...) ->
    @activate()
    args = ['in'] unless args.length
    res = []
    for port in args
      ip = @ports[port].get @scope
      res.push ip

    if args.length is 1 then res[0] else res

  # Fetches `data` property of IP object(s) for given port(s)
  getData: (args...) ->
    args = ['in'] unless args.length

    datas = []
    for port in args
      packet = @get port
      unless packet?
        # we add the null packet to the array so when getting
        # multiple ports, if one is null we still return it
        # so the indexes are correct.
        datas.push packet
        continue

      until packet.type is 'data'
        packet = @get port
        break unless packet

      packet = packet?.data ? undefined
      datas.push packet

      # check if there is any other `data` IPs
      unless (@buffer.find port, (ip) -> ip.type is 'data').length > 0
        @buffer.set port, []

    return datas.pop() if args.length is 1
    datas

  # Fetches a complete data stream from the buffer.
  getStream: (port, withoutConnectAndDisconnect = false) ->
    buf = @buffer.get port
    @buffer.filter port, (ip) -> false
    if withoutConnectAndDisconnect
      buf = buf.slice 1
      buf.pop()
    buf

class PortBuffer
  constructor: (@context) ->

  set: (name, buffer) ->
    if name? and typeof name isnt 'string'
      buffer = name
      name = null

    if @context.scope?
      if name?
        @context.ports[name].scopedBuffer[@context.scope] = buffer
        return @context.ports[name].scopedBuffer[@context.scope]
      @context.port.scopedBuffer[@context.scope] = buffer
      return @context.port.scopedBuffer[@context.scope]

    if name?
      @context.ports[name].buffer = buffer
      return @context.ports[name].buffer

    @context.port.buffer = buffer
    return @context.port.buffer

  # Get a buffer (scoped or not) for a given port
  # if name is optional, use the current port
  get: (name = null) ->
    if @context.scope?
      if name?
        return @context.ports[name].scopedBuffer[@context.scope]
      return @context.port.scopedBuffer[@context.scope]

    if name?
      return @context.ports[name].buffer
    return @context.port.buffer

  # Find packets matching a callback and return them without modifying the buffer
  find: (name, cb) ->
    b = @get name
    b.filter cb

  # Find packets and modify the original buffer
  # cb is a function with 2 arguments (ip, index)
  filter: (name, cb) ->
    if name? and typeof name isnt 'string'
      cb = name
      name = null

    b = @get name
    b = b.filter cb

    @set name, b

class ProcessOutput
  constructor: (@ports, @ip, @nodeInstance, @result) ->
    @scope = @ip.scope
    @sent = []

  # Checks if a value is an Error
  isError: (err) ->
    err instanceof Error or
    Array.isArray(err) and err.length > 0 and err[0] instanceof Error

  # Sends an error object
  error: (err) ->
    multiple = Array.isArray err
    err = [err] unless multiple
    if 'error' of @ports and
    (@ports.error.isAttached() or not @ports.error.isRequired())
      @sendIP 'error', new IP 'openBracket' if multiple
      @sendIP 'error', e for e in err
      @sendIP 'error', new IP 'closeBracket' if multiple
    else
      throw e for e in err

  # Sends a single IP object to a port
  sendIP: (port, packet) ->
    unless IP.isIP packet
      ip = new IP 'data', packet
    else
      ip = packet
    ip.scope = @scope if @scope isnt null and ip.scope is null

    if @nodeInstance.isOrdered()
      debug "#{@nodeInstance.nodeId} is in ordered mode, deferred send of #{ip.type} to #{port}"
      @result[port] = [] unless port of @result
      @result[port].push ip
      return
    debug "#{@nodeInstance.nodeId} direct send of #{ip.type} to #{port}"
    @nodeInstance.outPorts[port].sendIP ip

  # Sends packets for each port as a key in the map
  # or sends Error or a list of Errors if passed such
  send: (outputMap) ->
    return @error outputMap if @isError outputMap

    componentPorts = []
    mapIsInPorts = false
    for port in Object.keys @ports.ports
      componentPorts.push port if port isnt 'error' and port isnt 'ports' and port isnt '_callbacks'
      if not mapIsInPorts and outputMap? and typeof outputMap is 'object' and Object.keys(outputMap).indexOf(port) isnt -1
        mapIsInPorts = true

    if componentPorts.length is 1 and not mapIsInPorts
      @sendIP componentPorts[0], outputMap
      return

    for port, packet of outputMap
      @sendIP port, packet

  # Sends the argument via `send()` and marks activation as `done()`
  sendDone: (outputMap) ->
    @send outputMap
    @done()

  # Makes a map-style component pass a result value to `out`
  # keeping all IP metadata received from `in`,
  # or modifying it if `options` is provided
  pass: (data, options = {}) ->
    unless 'out' of @ports
      throw new Error 'output.pass() requires port "out" to be present'
    for key, val of options
      @ip[key] = val
    @ip.data = data
    @sendIP 'out', @ip
    @done()

  # Finishes process activation gracefully
  done: (error) ->
    @error error if error

    debug "#{@nodeInstance.nodeId} finished processing #{@nodeInstance.load}"
    @nodeInstance.load--

    if @nodeInstance.isOrdered()
      @result.__resolved = true
      @nodeInstance.processOutputQueue()
