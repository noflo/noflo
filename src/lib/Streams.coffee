#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014 The Grid
#     NoFlo may be freely distributed under the MIT license
#
# High-level wrappers for FBP substreams processing.
#

# Wraps an object to be used in Substreams
class IP
  constructor: (@data) ->
  sendTo: (port) ->
    port.send @data
  getValue: ->
    return @data
  toObject: ->
    return @data
  toString: ->
    return @data.toString()

exports.IP = IP

# Substream contains groups and data packets as a tree structure
class Substream
  constructor: (@key, @value) ->
    @value = [] if @value is undefined
  push: (value) ->
    @value.push value
  sendTo: (port) ->
    port.beginGroup @key
    ip.sendTo port for ip in @value
    port.endGroup()
  getKey: ->
    return @key
  getValue: ->
    switch @value.length
      when 0
        return null
      when 1
        return @value.getValue()
      else
        obj = {}
        i = 0
        hasKeys = false
        for ip in @value
          if ip instanceof Substream
            obj[ip.key] = ip.getValue()
            hasKeys = true
          else
            obj[i++] = ip.getValue()
        return if hasKeys then obj else (val for own key, val of obj)
  toObject: ->
    obj = {}
    obj[@key] = @getValue()
    return obj
  toString: ->
    return @toObject().toString()

exports.Substream = Substream

# StreamSender sends FBP substreams atomically.
# Supports buffering for preordered output.
class StreamSender
  constructor: (@port, @ordered = false) ->
    @groupsSent = false
    @q = []
    @resetCurrent()
    @resolved = false
  resetCurrent: ->
    @level = 0
    @root = null
    @current = null
    @parent = null
  beginGroup: (group) ->
    @level++
    stream = new Substream group
    if @level is 1
      @root = stream
      @parent = null
    else
      @parent = @current
    @current = stream
    return @
  endGroup: ->
    @level-- if @level > 0
    if @level is 0
      @q.push @root
      @resetCurrent()
    else
      @parent.push @current
      @current = @parent
    return @
  send: (data) ->
    if @level is 0
      @q.push new IP data
    else
      @current.push new IP data
    return @
  disconnect: ->
    if @ordered
      @resolved = true
    else
      @flush()
  flush: ->
    # Flush the buffers
    @port.connect()
    for ip in @q
      ip.sendTo @port
    @port.disconnect()
    @q = []
    return @

exports.StreamSender = StreamSender
