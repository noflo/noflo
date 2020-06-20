#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2020 Flowhub UG
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
debug = require('debug') 'noflo:component'

module.exports = class ProcessInput
  constructor: (@ports, @context) ->
    @nodeInstance = @context.nodeInstance
    @ip = @context.ip
    @port = @context.port
    @result = @context.result
    @scope = @context.scope

  # When preconditions are met, set component state to `activated`
  activate: ->
    return if @context.activated
    if @nodeInstance.isOrdered()
      # We're handling packets in order. Set the result as non-resolved
      # so that it can be send when the order comes up
      @result.__resolved = false
    @nodeInstance.activate @context
    if @port.isAddressable()
      debug "#{@nodeInstance.nodeId} packet on '#{@port.name}[#{@ip.index}]' caused activation #{@nodeInstance.load}: #{@ip.type}"
    else
      debug "#{@nodeInstance.nodeId} packet on '#{@port.name}' caused activation #{@nodeInstance.load}: #{@ip.type}"
    return

  # ## Connection listing
  # This allows components to check which input ports are attached. This is
  # useful mainly for addressable ports
  attached: (args...) ->
    args = ['in'] unless args.length
    res = []
    for port in args
      unless @ports[port]
        throw new Error "Node #{@nodeInstance.nodeId} has no port '#{port}'"
      res.push @ports[port].listAttached()
    return res.pop() if args.length is 1
    res

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
    else
      validate = -> true
    for port in args
      if Array.isArray port
        unless @ports[port[0]]
          throw new Error "Node #{@nodeInstance.nodeId} has no port '#{port[0]}'"
        unless @ports[port[0]].isAddressable()
          throw new Error "Non-addressable ports, access must be with string #{port[0]}"
        return false unless @ports[port[0]].has @scope, port[1], validate
        continue
      unless @ports[port]
        throw new Error "Node #{@nodeInstance.nodeId} has no port '#{port}'"
      if @ports[port].isAddressable()
        throw new Error "For addressable ports, access must be with array [#{port}, idx]"
      return false unless @ports[port].has @scope, validate
    return true

  # Returns true if the ports contain data packets
  hasData: (args...) ->
    args = ['in'] unless args.length
    args.push (ip) -> ip.type is 'data'
    return @has.apply @, args

  # Returns true if a port has a complete stream in its input buffer.
  hasStream: (args...) ->
    args = ['in'] unless args.length

    if typeof args[args.length - 1] is 'function'
      validateStream = args.pop()
    else
      validateStream = -> true

    for port in args
      portBrackets = []
      dataBrackets = []
      hasData = false
      validate = (ip) ->
        if ip.type is 'openBracket'
          portBrackets.push ip.data
          return false
        if ip.type is 'data'
          # Run the stream validation callback
          hasData = validateStream ip, portBrackets
          # Data IP on its own is a valid stream
          return hasData unless portBrackets.length
          # Otherwise we need to check for complete stream
          return false
        if ip.type is 'closeBracket'
          portBrackets.pop()
          return false if portBrackets.length
          return false unless hasData
          return true
      return false unless @has port, validate
    true

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
      if Array.isArray port
        [portname, idx] = port
        unless @ports[portname].isAddressable()
          throw new Error 'Non-addressable ports, access must be with string portname'
      else
        portname = port
        if @ports[portname].isAddressable()
          throw new Error 'For addressable ports, access must be with array [portname, idx]'
      if @nodeInstance.isForwardingInport portname
        ip = @__getForForwarding portname, idx
        res.push ip
        continue
      ip = @ports[portname].get @scope, idx
      res.push ip

    if args.length is 1 then res[0] else res

  __getForForwarding: (port, idx) ->
    prefix = []
    dataIp = null
    # Read IPs until we hit data
    loop
      # Read next packet
      ip = @ports[port].get @scope, idx
      # Stop at the end of the buffer
      break unless ip
      if ip.type is 'data'
        # Hit the data IP, stop here
        dataIp = ip
        break
      # Keep track of bracket closings and openings before
      prefix.push ip

    # Forwarding brackets that came before data packet need to manipulate context
    # and be added to result so they can be forwarded correctly to ports that
    # need them
    for ip in prefix
      if ip.type is 'closeBracket'
        # Bracket closings before data should remove bracket context
        @result.__bracketClosingBefore = [] unless @result.__bracketClosingBefore
        context = @nodeInstance.getBracketContext('in', port, @scope, idx).pop()
        context.closeIp = ip
        @result.__bracketClosingBefore.push context
        continue
      if ip.type is 'openBracket'
        # Bracket openings need to go to bracket context
        @nodeInstance.getBracketContext('in', port, @scope, idx).push
          ip: ip
          ports: []
          source: port
        continue

    # Add current bracket context to the result so that when we send
    # to ports we can also add the surrounding brackets
    @result.__bracketContext = {} unless @result.__bracketContext
    @result.__bracketContext[port] = @nodeInstance.getBracketContext('in', port, @scope, idx).slice 0
    # Bracket closings that were in buffer after the data packet need to
    # be added to result for done() to read them from
    return dataIp

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

      datas.push packet.data

    return datas.pop() if args.length is 1
    datas

  # Fetches a complete data stream from the buffer.
  getStream: (args...) ->
    args = ['in'] unless args.length
    datas = []
    for port in args
      portBrackets = []
      portPackets = []
      hasData = false
      ip = @get port
      datas.push undefined unless ip
      while ip
        if ip.type is 'openBracket'
          unless portBrackets.length
            # First openBracket in stream, drop previous
            portPackets = []
            hasData = false
          portBrackets.push ip.data
          portPackets.push ip
        if ip.type is 'data'
          portPackets.push ip
          hasData = true
          # Unbracketed data packet is a valid stream
          break unless portBrackets.length
        if ip.type is 'closeBracket'
          portPackets.push ip
          portBrackets.pop()
          if hasData and not portBrackets.length
            # Last close bracket finishes stream if there was data inside
            break
        ip = @get port
      datas.push portPackets

    return datas.pop() if args.length is 1
    datas