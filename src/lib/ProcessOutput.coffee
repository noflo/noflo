#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2020 Flowhub UG
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
debug = require('debug') 'noflo:component'

IP = require './IP'

module.exports = class ProcessOutput
  constructor: (@ports, @context) ->
    @nodeInstance = @context.nodeInstance
    @ip = @context.ip
    @result = @context.result
    @scope = @context.scope

  # Checks if a value is an Error
  isError: (err) ->
    return err instanceof Error or Array.isArray(err) and err.length > 0 and err[0] instanceof Error

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
    return

  # Sends a single IP object to a port
  sendIP: (port, packet) ->
    unless IP.isIP packet
      ip = new IP 'data', packet
    else
      ip = packet
    ip.scope = @scope if @scope isnt null and ip.scope is null

    if @nodeInstance.outPorts[port].isAddressable() and ip.index is null
      throw new Error 'Sending packets to addressable ports requires specifying index'

    if @nodeInstance.isOrdered()
      @nodeInstance.addToResult @result, port, ip
      return
    unless @nodeInstance.outPorts[port].options.scoped
      ip.scope = null
    @nodeInstance.outPorts[port].sendIP ip
    return

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

    if componentPorts.length > 1 and not mapIsInPorts
      throw new Error 'Port must be specified for sending output'

    for port, packet of outputMap
      @sendIP port, packet
    return

  # Sends the argument via `send()` and marks activation as `done()`
  sendDone: (outputMap) ->
    @send outputMap
    @done()
    return

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
    return

  # Finishes process activation gracefully
  done: (error) ->
    @result.__resolved = true
    @nodeInstance.activate @context
    @error error if error

    isLast = =>
      # We only care about real output sets with processing data
      resultsOnly = @nodeInstance.outputQ.filter (q) ->
        return true unless q.__resolved
        if Object.keys(q).length is 2 and q.__bracketClosingAfter
          return false
        true
      pos = resultsOnly.indexOf @result
      len = resultsOnly.length
      load = @nodeInstance.load
      return true if pos is len - 1
      return true if pos is -1 and load is len + 1
      return true if len <= 1 and load is 1
      false
    if @nodeInstance.isOrdered() and isLast()
      # We're doing bracket forwarding. See if there are
      # dangling closeBrackets in buffer since we're the
      # last running process function.
      for port, contexts of @nodeInstance.bracketContext.in
        continue unless contexts[@scope]
        nodeContext = contexts[@scope]
        continue unless nodeContext.length
        context = nodeContext[nodeContext.length - 1]
        buf = @nodeInstance.inPorts[context.source].getBuffer context.ip.scope, context.ip.index
        loop
          break unless buf.length
          break unless buf[0].type is 'closeBracket'
          ip = @nodeInstance.inPorts[context.source].get context.ip.scope, context.ip.index
          ctx = nodeContext.pop()
          ctx.closeIp = ip
          @result.__bracketClosingAfter = [] unless @result.__bracketClosingAfter
          @result.__bracketClosingAfter.push ctx

    debug "#{@nodeInstance.nodeId} finished processing #{@nodeInstance.load}"

    @nodeInstance.deactivate @context
    return