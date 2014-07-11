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

exports.IP = IP

# Substream contains groups and data packets as a tree structure
class Substream
  constructor: (@key) ->
    @value = []
  push: (value) ->
    @value.push value
  sendTo: (port) ->
    port.beginGroup @key
    for ip in @value
      if ip instanceof Substream or ip instanceof IP
        ip.sendTo port
      else
        port.send ip
    port.endGroup()
  getKey: ->
    return @key
  getValue: ->
    switch @value.length
      when 0
        return null
      when 1
        if typeof @value[0].getValue is 'function'
          if @value[0] instanceof Substream
            obj = {}
            obj[@value[0].key] = @value[0].getValue()
            return obj
          else
            return @value[0].getValue()
        else
          return @value[0]
      else
        res = []
        hasKeys = false
        for ip in @value
          val = if typeof ip.getValue is 'function' then ip.getValue() else ip
          if ip instanceof Substream
            obj = {}
            obj[ip.key] = ip.getValue()
            res.push obj
          else
            res.push val
        return res
  toObject: ->
    obj = {}
    obj[@key] = @getValue()
    return obj

exports.Substream = Substream

# StreamSender sends FBP substreams atomically.
# Supports buffering for preordered output.
class StreamSender
  constructor: (@port, @ordered = false) ->
    @q = []
    @resetCurrent()
    @resolved = false
  resetCurrent: ->
    @level = 0
    @current = null
    @stack = []
  beginGroup: (group) ->
    @level++
    stream = new Substream group
    @stack.push stream
    @current = stream
    return @
  endGroup: ->
    @level-- if @level > 0
    value = @stack.pop()
    if @level is 0
      @q.push value
      @resetCurrent()
    else
      parent = @stack[@stack.length - 1]
      parent.push value
      @current = parent
    return @
  send: (data) ->
    if @level is 0
      @q.push new IP data
    else
      @current.push new IP data
    return @
  done: ->
    if @ordered
      @resolved = true
    else
      @flush()
    return @
  disconnect: ->
    @q.push null # disconnect packet
    return @
  flush: ->
    # Flush the buffers
    res = false
    if @q.length > 0
      for ip in @q
        if ip is null
          @port.disconnect() if @port.isConnected()
        else
          ip.sendTo @port
      res = true
    @q = []
    return res
  isAttached: ->
    return @port.isAttached()

exports.StreamSender = StreamSender

# StreamReceiver wraps an inport and reads entire
# substreams as single objects.
class StreamReceiver
  constructor: (@port, @buffered = false, @process = null) ->
    @q = []
    @resetCurrent()
    @port.process = (event, payload, index) =>
      switch event
        when 'connect'
          @process 'connect', index if typeof @process is 'function'
        when 'begingroup'
          @level++
          stream = new Substream payload
          if @level is 1
            @root = stream
            @parent = null
          else
            @parent = @current
          @current = stream
        when 'endgroup'
          @level-- if @level > 0
          if @level is 0
            if @buffered
              @q.push @root
              @process 'readable', index
            else
              @process 'data', @root, index if typeof @process is 'function'
            @resetCurrent()
          else
            @parent.push @current
            @current = @parent
        when 'data'
          if @level is 0
            @q.push new IP payload
          else
            @current.push new IP payload
        when 'disconnect'
          @process 'disconnect', index if typeof @process is 'function'
  resetCurrent: ->
    @level = 0
    @root = null
    @current = null
    @parent = null
  read: ->
    return undefined if @q.length is 0
    return @q.shift()

exports.StreamReceiver = StreamReceiver
