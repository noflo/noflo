#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013 The Grid
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
unless require('./Platform').isBrowser()
  {EventEmitter} = require 'events'
else
  EventEmitter = require 'emitter'

# ## Internal Sockets
#
# The default communications mechanism between NoFlo processes is
# an _internal socket_, which is responsible for accepting information
# packets sent from processes' outports, and emitting corresponding
# events so that the packets can be caught to the inport of the
# connected process.
class InternalSocket extends EventEmitter
  constructor: ->
    @connected = false
    @groups = []

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
    return if @connected
    @connected = true
    @emit 'connect', @

  disconnect: ->
    return unless @connected
    @connected = false
    @emit 'disconnect', @

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
    @connect() unless @connected
    @emit 'data', data

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
    @groups.push group
    @emit 'begingroup', group

  endGroup: ->
    @emit 'endgroup', @groups.pop()

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

exports.InternalSocket = InternalSocket

exports.createSocket = -> new InternalSocket
