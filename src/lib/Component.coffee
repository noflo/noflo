#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2017 Flowhub UG
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
{EventEmitter} = require 'events'

ports = require './Ports'
IP = require './IP'
ProcessContext = require './ProcessContext'
ProcessInput = require './ProcessInput'
ProcessOutput = require './ProcessOutput'

debug = require('debug') 'noflo:component'
debugBrackets = require('debug') 'noflo:component:brackets'
debugSend = require('debug') 'noflo:component:send'

# ## NoFlo Component Base class
#
# The `noflo.Component` interface provides a way to instantiate
# and extend NoFlo components.
class Component extends EventEmitter
  description: ''
  icon: null

  constructor: (options) ->
    super()
    options = {} unless options

    # Prepare inports, if any were given in options.
    # They can also be set up imperatively after component
    # instantiation by using the `component.inPorts.add`
    # method.
    options.inPorts = {} unless options.inPorts
    if options.inPorts instanceof ports.InPorts
      @inPorts = options.inPorts
    else
      @inPorts = new ports.InPorts options.inPorts

    # Prepare outports, if any were given in options.
    # They can also be set up imperatively after component
    # instantiation by using the `component.outPorts.add`
    # method.
    options.outPorts = {} unless options.outPorts
    if options.outPorts instanceof ports.OutPorts
      @outPorts = options.outPorts
    else
      @outPorts = new ports.OutPorts options.outPorts

    # Set the default component icon and description
    @icon = options.icon if options.icon
    @description = options.description if options.description

    # Initially the component is not started
    @started = false
    @load = 0

    # Whether the component should keep send packets
    # out in the order they were received
    @ordered = options.ordered ? false
    @autoOrdering = options.autoOrdering ? null

    # Queue for handling ordered output packets
    @outputQ = []

    # Context used for bracket forwarding
    @bracketContext =
      in: {}
      out: {}

    # Whether the component should activate when it
    # receives packets
    @activateOnInput = options.activateOnInput ? true

    # Bracket forwarding rules. By default we forward
    # brackets from `in` port to `out` and `error` ports.
    @forwardBrackets = in: ['out', 'error']
    if 'forwardBrackets' of options
      @forwardBrackets = options.forwardBrackets

    # The component's process function can either be
    # passed in options, or given imperatively after
    # instantation using the `component.process` method.
    if typeof options.process is 'function'
      @process options.process

  getDescription: -> @description

  isReady: -> true

  isSubgraph: -> false

  setIcon: (@icon) ->
    @emit 'icon', @icon
    return
  getIcon: -> @icon

  # ### Error emitting helper
  #
  # If component has an `error` outport that is connected, errors
  # are sent as IP objects there. If the port is not connected,
  # errors are thrown.
  error: (e, groups = [], errorPort = 'error', scope = null) =>
    if @outPorts[errorPort] and (@outPorts[errorPort].isAttached() or not @outPorts[errorPort].isRequired())
      @outPorts[errorPort].openBracket group, scope: scope for group in groups
      @outPorts[errorPort].data e, scope: scope
      @outPorts[errorPort].closeBracket group, scope: scope for group in groups
      return
    throw e
    return

  # ### Setup
  #
  # The setUp method is for component-specific initialization.
  # Called at network start-up.
  #
  # Override in component implementation to do component-specific
  # setup work.
  setUp: (callback) ->
    do callback
    return

  # ### Setup
  #
  # The tearDown method is for component-specific cleanup. Called
  # at network shutdown
  #
  # Override in component implementation to do component-specific
  # cleanup work, like clearing any accumulated state.
  tearDown: (callback) ->
    do callback
    return

  # ### Start
  #
  # Called when network starts. This sets calls the setUp
  # method and sets the component to a started state.
  start: (callback) ->
    return callback() if @isStarted()
    @setUp (err) =>
      return callback err if err
      @started = true
      @emit 'start'
      callback null
      return
    return

  # ### Shutdown
  #
  # Called when network is shut down. This sets calls the
  # tearDown method and sets the component back to a
  # non-started state.
  #
  # The callback is called when tearDown finishes and
  # all active processing contexts have ended.
  shutdown: (callback) ->
    finalize = =>
      # Clear contents of inport buffers
      inPorts = @inPorts.ports or @inPorts
      for portName, inPort of inPorts
        continue unless typeof inPort.clear is 'function'
        inPort.clear()
      # Clear bracket context
      @bracketContext =
        in: {}
        out: {}
      return callback() unless @isStarted()
      @started = false
      @emit 'end'
      callback()
      return

    # Tell the component that it is time to shut down
    @tearDown (err) =>
      return callback err if err
      if @load > 0
        # Some in-flight processes, wait for them to finish
        checkLoad = (load) ->
          return if load > 0
          @removeListener 'deactivate', checkLoad
          finalize()
          return
        @on 'deactivate', checkLoad
        return
      finalize()
      return
    return

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
    return

  # Method for determining if a component is using the modern
  # NoFlo Process API
  isLegacy: ->
    # Process API
    return false if @handle
    # Legacy
    true

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

  # Method for checking if a given inport is set up for
  # automatic bracket forwarding
  isForwardingInport: (port) ->
    if typeof port is 'string'
      portName = port
    else
      portName = port.name
    if portName of @forwardBrackets
      return true
    false

  # Method for checking if a given outport is set up for
  # automatic bracket forwarding
  isForwardingOutport: (inport, outport) ->
    if typeof inport is 'string'
      inportName = inport
    else
      inportName = inport.name
    if typeof outport is 'string'
      outportName = outport
    else
      outportName = outport.name
    return false unless @forwardBrackets[inportName]
    return true if @forwardBrackets[inportName].indexOf(outportName) isnt -1
    false

  # Method for checking whether the component sends packets
  # in the same order they were received.
  isOrdered: ->
    return true if @ordered
    return true if @autoOrdering
    false

  # ### Handling IP objects
  #
  # The component has received an Information Packet. Call the
  # processing function so that firing pattern preconditions can
  # be checked and component can do processing as needed.
  handleIP: (ip, port) ->
    unless port.options.triggering
      # If port is non-triggering, we can skip the process function call
      return

    if ip.type is 'openBracket' and @autoOrdering is null and not @ordered
      # Switch component to ordered mode when receiving a stream unless
      # auto-ordering is disabled
      debug "#{@nodeId} port '#{port.name}' entered auto-ordering mode"
      @autoOrdering = true

    # Initialize the result object for situations where output needs
    # to be queued to be kept in order
    result = {}

    if @isForwardingInport port
      # For bracket-forwarding inports we need to initialize a bracket context
      # so that brackets can be sent as part of the output, and closed after.
      if ip.type is 'openBracket'
        # For forwarding ports openBrackets don't fire
        return

      if ip.type is 'closeBracket'
        # For forwarding ports closeBrackets don't fire
        # However, we need to handle several different scenarios:
        # A. There are closeBrackets in queue before current packet
        # B. There are closeBrackets in queue after current packet
        # C. We've queued the results from all in-flight processes and
        #    new closeBracket arrives
        buf = port.getBuffer ip.scope, ip.index
        dataPackets = buf.filter (ip) -> ip.type is 'data'
        if @outputQ.length >= @load and dataPackets.length is 0
          return unless buf[0] is ip
          # Remove from buffer
          port.get ip.scope, ip.index
          context = @getBracketContext('in', port.name, ip.scope, ip.index).pop()
          context.closeIp = ip
          debugBrackets "#{@nodeId} closeBracket-C from '#{context.source}' to #{context.ports}: '#{ip.data}'"
          result =
            __resolved: true
            __bracketClosingAfter: [context]
          @outputQ.push result
          do @processOutputQueue
        # Check if buffer contains data IPs. If it does, we want to allow
        # firing
        return unless dataPackets.length

    # Prepare the input/output pair
    context = new ProcessContext ip, @, port, result
    input = new ProcessInput @inPorts, context
    output = new ProcessOutput @outPorts, context
    try
      # Call the processing function
      @handle input, output, context
    catch e
      @deactivate context
      output.sendDone e

    return if context.activated
    # If receiving an IP object didn't cause the component to
    # activate, log that input conditions were not met
    if port.isAddressable()
      debug "#{@nodeId} packet on '#{port.name}[#{ip.index}]' didn't match preconditions: #{ip.type}"
      return
    debug "#{@nodeId} packet on '#{port.name}' didn't match preconditions: #{ip.type}"
    return

  # Get the current bracket forwarding context for an IP object
  getBracketContext: (type, port, scope, idx) ->
    {name, index} = ports.normalizePortName port
    index = idx if idx?
    portsList = if type is 'in' then @inPorts else @outPorts
    if portsList[name].isAddressable()
      port = "#{name}[#{index}]"
    # Ensure we have a bracket context for the current scope
    @bracketContext[type][port] = {} unless @bracketContext[type][port]
    @bracketContext[type][port][scope] = [] unless @bracketContext[type][port][scope]
    return @bracketContext[type][port][scope]

  # Add an IP object to the list of results to be sent in
  # order
  addToResult: (result, port, ip, before = false) ->
    {name, index} = ports.normalizePortName port
    method = if before then 'unshift' else 'push'
    if @outPorts[name].isAddressable()
      idx = if index then parseInt(index) else ip.index
      result[name] = {} unless result[name]
      result[name][idx] = [] unless result[name][idx]
      ip.index = idx
      result[name][idx][method] ip
      return
    result[name] = [] unless result[name]
    return result[name][method] ip

  # Get contexts that can be forwarded with this in/outport
  # pair.
  getForwardableContexts: (inport, outport, contexts) ->
    {name, index} = ports.normalizePortName outport
    forwardable = []
    contexts.forEach (ctx, idx) =>
      # No forwarding to this outport
      return unless @isForwardingOutport inport, name
      # We have already forwarded this context to this outport
      return unless ctx.ports.indexOf(outport) is -1
      # See if we have already forwarded the same bracket from another
      # inport
      outContext = @getBracketContext('out', name, ctx.ip.scope, index)[idx]
      if outContext
        return if outContext.ip.data is ctx.ip.data and outContext.ports.indexOf(outport) isnt -1
      forwardable.push ctx
    return forwardable

  # Add any bracket forwards needed to the result queue
  addBracketForwards: (result) ->
    if result.__bracketClosingBefore?.length
      for context in result.__bracketClosingBefore
        debugBrackets "#{@nodeId} closeBracket-A from '#{context.source}' to #{context.ports}: '#{context.closeIp.data}'"
        continue unless context.ports.length
        for port in context.ports
          ipClone = context.closeIp.clone()
          @addToResult result, port, ipClone, true
          @getBracketContext('out', port, ipClone.scope).pop()

    if result.__bracketContext
      # First see if there are any brackets to forward. We need to reverse
      # the keys so that they get added in correct order
      Object.keys(result.__bracketContext).reverse().forEach (inport) =>
        context = result.__bracketContext[inport]
        return unless context.length
        for outport, ips of result
          continue if outport.indexOf('__') is 0
          if @outPorts[outport].isAddressable()
            for idx, idxIps of ips
              # Don't register indexes we're only sending brackets to
              datas = idxIps.filter (ip) -> ip.type is 'data'
              continue unless datas.length
              portIdentifier = "#{outport}[#{idx}]"
              unforwarded = @getForwardableContexts inport, portIdentifier, context
              continue unless unforwarded.length
              forwardedOpens = []
              for ctx in unforwarded
                debugBrackets "#{@nodeId} openBracket from '#{inport}' to '#{portIdentifier}': '#{ctx.ip.data}'"
                ipClone = ctx.ip.clone()
                ipClone.index = parseInt idx
                forwardedOpens.push ipClone
                ctx.ports.push portIdentifier
                @getBracketContext('out', outport, ctx.ip.scope, idx).push ctx
              forwardedOpens.reverse()
              @addToResult result, outport, ip, true for ip in forwardedOpens
            continue
          # Don't register ports we're only sending brackets to
          datas = ips.filter (ip) -> ip.type is 'data'
          continue unless datas.length
          unforwarded = @getForwardableContexts inport, outport, context
          continue unless unforwarded.length
          forwardedOpens = []
          for ctx in unforwarded
            debugBrackets "#{@nodeId} openBracket from '#{inport}' to '#{outport}': '#{ctx.ip.data}'"
            forwardedOpens.push ctx.ip.clone()
            ctx.ports.push outport
            @getBracketContext('out', outport, ctx.ip.scope).push ctx
          forwardedOpens.reverse()
          @addToResult result, outport, ip, true for ip in forwardedOpens

    if result.__bracketClosingAfter?.length
      for context in result.__bracketClosingAfter
        debugBrackets "#{@nodeId} closeBracket-B from '#{context.source}' to #{context.ports}: '#{context.closeIp.data}'"
        continue unless context.ports.length
        for port in context.ports
          ipClone = context.closeIp.clone()
          @addToResult result, port, ipClone, false
          @getBracketContext('out', port, ipClone.scope).pop()

    delete result.__bracketClosingBefore
    delete result.__bracketContext
    delete result.__bracketClosingAfter
    return

  # Whenever an execution context finishes, send all resolved
  # output from the queue in the order it is in.
  processOutputQueue: ->
    while @outputQ.length > 0
      break unless @outputQ[0].__resolved
      result = @outputQ.shift()
      @addBracketForwards result
      for port, ips of result
        continue if port.indexOf('__') is 0
        if @outPorts.ports[port].isAddressable()
          for idx, idxIps of ips
            idx = parseInt idx
            continue unless @outPorts.ports[port].isAttached idx
            for ip in idxIps
              portIdentifier = "#{port}[#{ip.index}]"
              if ip.type is 'openBracket'
                debugSend "#{@nodeId} sending #{portIdentifier} < '#{ip.data}'"
              else if ip.type is 'closeBracket'
                debugSend "#{@nodeId} sending #{portIdentifier} > '#{ip.data}'"
              else
                debugSend "#{@nodeId} sending #{portIdentifier} DATA"
              unless @outPorts[port].options.scoped
                ip.scope = null
              @outPorts[port].sendIP ip
          continue
        continue unless @outPorts.ports[port].isAttached()
        for ip in ips
          portIdentifier = port
          if ip.type is 'openBracket'
            debugSend "#{@nodeId} sending #{portIdentifier} < '#{ip.data}'"
          else if ip.type is 'closeBracket'
            debugSend "#{@nodeId} sending #{portIdentifier} > '#{ip.data}'"
          else
            debugSend "#{@nodeId} sending #{portIdentifier} DATA"
          unless @outPorts[port].options.scoped
            ip.scope = null
          @outPorts[port].sendIP ip
    return

  # Signal that component has activated. There may be multiple
  # activated contexts at the same time
  activate: (context) ->
    return if context.activated # prevent double activation
    context.activated = true
    context.deactivated = false
    @load++
    @emit 'activate', @load
    if @ordered or @autoOrdering
      @outputQ.push context.result
    return


  # Signal that component has deactivated. There may be multiple
  # activated contexts at the same time
  deactivate: (context) ->
    return if context.deactivated # prevent double deactivation
    context.deactivated = true
    context.activated = false
    if @isOrdered()
      @processOutputQueue()
    @load--
    @emit 'deactivate', @load
    return

exports.Component = Component
