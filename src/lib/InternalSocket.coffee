#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2016 TheGrid (Rituwall Inc.)
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
{EventEmitter} = require 'events'
IP = require './IP'

# ## Internal Sockets
#
# The default communications mechanism between NoFlo processes is
# an _internal socket_, which is responsible for accepting information
# packets sent from processes' outports, and emitting corresponding
# events so that the packets can be caught to the inport of the
# connected process.
class InternalSocket extends EventEmitter
  regularEmitEvent: (event, data) ->
    @emit event, data

  debugEmitEvent: (event, data) ->
    try
      @emit event, data
    catch error
      throw error if @listeners('error').length is 0
      @emit 'error',
        id: @to.process.id
        error: error
        metadata: @metadata

  constructor: (@metadata = {}) ->
    @connected = false
    @groups = []
    @dataDelegate = null
    @debug = false
    @emitEvent = @regularEmitEvent
    @braceCount = 0

  # ## Socket connections
  #
  # Sockets that are attached to the ports of processes may be
  # either connected or disconnected. The semantical meaning of
  # a connection is that the outport is in the process of sending
  # data. Disconnecting means an end of transmission.
  #
  # This can be used for example to signal the beginning and end
  # of information packets resulting from the reading of a single
  # file or a database query.
  #
  # Example, disconnecting when a file has been completely read:
  #
  #     readBuffer: (fd, position, size, buffer) ->
  #       fs.read fd, buffer, 0, buffer.length, position, (err, bytes, buffer) =>
  #         # Send data. The first send will also connect if not
  #         # already connected.
  #         @outPorts.out.send buffer.slice 0, bytes
  #         position += buffer.length
  #
  #         # Disconnect when the file has been completely read
  #         return @outPorts.out.disconnect() if position >= size
  #
  #         # Otherwise, call same method recursively
  #         @readBuffer fd, position, size, buffer
  connect: ->
    @handleSocketEvent 'connect', null

  disconnect: ->
    @handleSocketEvent 'disconnect', null

  isConnected: -> @connected

  # ## Sending information packets
  #
  # The _send_ method is used by a processe's outport to
  # send information packets. The actual packet contents are
  # not defined by NoFlo, and may be any valid JavaScript data
  # structure.
  #
  # The packet contents however should be such that may be safely
  # serialized or deserialized via JSON. This way the NoFlo networks
  # can be constructed with more flexibility, as file buffers or
  # message queues can be used as additional packet relay mechanisms.
  send: (data) ->
    data = @dataDelegate() if data is undefined and typeof @dataDelegate is 'function'
    @handleSocketEvent 'data', data

  # ## Sending information packets without open bracket
  #
  # As _connect_ event is considered as open bracket, it needs to be followed
  # by a _disconnect_ event or a closing bracket. In the new simplified
  # sending semantics single IP objects can be sent without open/close brackets.
  post: (data) ->
    data = @dataDelegate() if data is undefined and typeof @dataDelegate is 'function'
    @handleSocketEvent 'data', data, false

  # ## Information Packet grouping
  #
  # Processes sending data to sockets may also group the packets
  # when necessary. This allows transmitting tree structures as
  # a stream of packets.
  #
  # For example, an object could be split into multiple packets
  # where each property is identified by a separate grouping:
  #
  #     # Group by object ID
  #     @outPorts.out.beginGroup object.id
  #
  #     for property, value of object
  #       @outPorts.out.beginGroup property
  #       @outPorts.out.send value
  #       @outPorts.out.endGroup()
  #
  #     @outPorts.out.endGroup()
  #
  # This would cause a tree structure to be sent to the receiving
  # process as a stream of packets. So, an article object may be
  # as packets like:
  #
  # * `/<article id>/title/Lorem ipsum`
  # * `/<article id>/author/Henri Bergius`
  #
  # Components are free to ignore groupings, but are recommended
  # to pass received groupings onward if the data structures remain
  # intact through the component's processing.
  beginGroup: (group) ->
    @handleSocketEvent 'begingroup', group

  endGroup: ->
    @handleSocketEvent 'endgroup'

  # ## Socket data delegation
  #
  # Sockets have the option to receive data from a delegate function
  # should the `send` method receive undefined for `data`.  This
  # helps in the case of defaulting values.
  setDataDelegate: (delegate) ->
    unless typeof delegate is 'function'
      throw Error 'A data delegate must be a function.'
    @dataDelegate = delegate

  # ## Socket debug mode
  #
  # Sockets can catch exceptions happening in processes when data is
  # sent to them. These errors can then be reported to the network for
  # notification to the developer.
  setDebug: (active) ->
    @debug = active
    @emitEvent = if @debug then @debugEmitEvent else @regularEmitEvent

  # ## Socket identifiers
  #
  # Socket identifiers are mainly used for debugging purposes.
  # Typical identifiers look like _ReadFile:OUT -> Display:IN_,
  # but for sockets sending initial information packets to
  # components may also loom like _DATA -> ReadFile:SOURCE_.
  getId: ->
    fromStr = (from) ->
      "#{from.process.id}() #{from.port.toUpperCase()}"
    toStr = (to) ->
      "#{to.port.toUpperCase()} #{to.process.id}()"

    return "UNDEFINED" unless @from or @to
    return "#{fromStr(@from)} -> ANON" if @from and not @to
    return "DATA -> #{toStr(@to)}" unless @from
    "#{fromStr(@from)} -> #{toStr(@to)}"

  legacyToIp: (event, payload) ->
    # No need to wrap modern IP Objects
    return payload if IP.isIP payload

    # Wrap legacy events into appropriate IP objects
    switch event
      when 'connect', 'begingroup'
        return new IP 'openBracket', payload
      when 'disconnect', 'endgroup'
        return new IP 'closeBracket'
      else
        return new IP 'data', payload

  ipToLegacy: (ip) ->
    switch ip.type
      when 'openBracket'
        @braceCount++
        if @braceCount is 1
          return legacy =
            event: 'connect'
            payload: @
        return legacy =
          event: 'begingroup'
          payload: ip.data
      when 'data'
        return legacy =
          event: 'data'
          payload: ip.data
      when 'closeBracket'
        @braceCount--
        if @braceCount is 0
          return legacy =
            event: 'disconnect'
            payload: @
        return legacy =
          event: 'endgroup'
          payload: ip.data

  handleSocketEvent: (event, payload, autoConnect = true) ->
    ip = @legacyToIp event, payload

    # Handle state transitions
    if ip.type is 'data' and not @connected and autoConnect
      # Connect before sending data
      @handleSocketEvent 'connect', null

    if ip.type is 'openBracket' and ip.data
      if not @connected and autoConnect
        # Connect before sending bracket
        @handleSocketEvent 'connect', null
      # Append bracket to socket group list
      @groups.push ip.data

    if ip.type is 'openBracket' and ip.data is null
      # If we're already connected, no need to connect again
      return if @connected
      @connected = true

    if ip.type is 'closeBracket'
      if @groups.length
        # Add group name to bracket
        ip.data = @groups.pop()
      else
        # If we were already disconnected, no need to disconnect again
        return unless @connected
        # Last bracket was closed, we're disconnected
        @connected = false
        ip.data = null

    # Emit the IP Object
    @emitEvent 'ip', ip

    # Emit the legacy event
    legacyEvent = @ipToLegacy ip
    @emitEvent 'connect' if ip.type is 'data' and @braceCount is 0
    @emitEvent legacyEvent.event, legacyEvent.payload
    @emitEvent 'disconnect' if ip.type is 'data' and @braceCount is 0

exports.InternalSocket = InternalSocket

exports.createSocket = -> new InternalSocket
