#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2017 Flowhub UG
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# Baseclass for components dealing with asynchronous I/O operations. Supports
# throttling.
port = require "./Port"
component = require "./Component"
platform = require './Platform'

class AsyncComponent extends component.Component

  constructor: (@inPortName="in", @outPortName="out", @errPortName="error") ->
    platform.deprecated 'noflo.AsyncComponent is deprecated. Please port to Process API'

    unless @inPorts[@inPortName]
      throw new Error "no inPort named '#{@inPortName}'"
    unless @outPorts[@outPortName]
      throw new Error "no outPort named '#{@outPortName}'"

    @load = 0
    @q = []
    @errorGroups = []

    @outPorts.load = new port.Port()

    @inPorts[@inPortName].on "begingroup", (group) =>
      return @q.push { name: "begingroup", data: group } if @load > 0
      @errorGroups.push group
      @outPorts[@outPortName].beginGroup group

    @inPorts[@inPortName].on "endgroup", =>
      return @q.push { name: "endgroup" } if @load > 0
      @errorGroups.pop()
      @outPorts[@outPortName].endGroup()

    @inPorts[@inPortName].on "disconnect", =>
      return @q.push { name: "disconnect" } if @load > 0
      @outPorts[@outPortName].disconnect()
      @errorGroups = []
      @outPorts.load.disconnect() if @outPorts.load.isAttached()

    @inPorts[@inPortName].on "data", (data) =>
      return @q.push { name: "data", data: data } if @q.length > 0
      @processData data

  processData: (data) ->
    @incrementLoad()
    @doAsync data, (err) =>
      @error err, @errorGroups, @errPortName if err
      @decrementLoad()

  incrementLoad: ->
    @load++
    @outPorts.load.send @load if @outPorts.load.isAttached()
    @outPorts.load.disconnect() if @outPorts.load.isAttached()

  doAsync: (data, callback) ->
    callback new Error "AsyncComponents must implement doAsync"

  decrementLoad: ->
    throw new Error "load cannot be negative" if @load == 0
    @load--
    @outPorts.load.send @load if @outPorts.load.isAttached()
    @outPorts.load.disconnect() if @outPorts.load.isAttached()
    if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
      # nextTick is faster than setTimeout on Node.js
      process.nextTick => @processQueue()
    else
      setTimeout =>
        do @processQueue
      , 0

  processQueue: ->
    if @load > 0
      return
    processedData = false
    while @q.length > 0
      event = @q[0]
      switch event.name
        when "begingroup"
          return if processedData
          @outPorts[@outPortName].beginGroup event.data
          @errorGroups.push event.data
          @q.shift()
        when "endgroup"
          return if processedData
          @outPorts[@outPortName].endGroup()
          @errorGroups.pop()
          @q.shift()
        when "disconnect"
          return if processedData
          @outPorts[@outPortName].disconnect()
          @outPorts.load.disconnect() if @outPorts.load.isAttached()
          @errorGroups = []
          @q.shift()
        when "data"
          @processData event.data
          @q.shift()
          processedData = true

  tearDown: (callback) ->
    @q = []
    @errorGroups = []
    do callback

  # Old-style error function because of legacy ports
  error: (e, groups = [], errorPort = 'error') =>
    if @outPorts[errorPort] and (@outPorts[errorPort].isAttached() or not @outPorts[errorPort].isRequired())
      @outPorts[errorPort].beginGroup group for group in groups
      @outPorts[errorPort].send e
      @outPorts[errorPort].endGroup() for group in groups
      @outPorts[errorPort].disconnect()
      return
    throw e

exports.AsyncComponent = AsyncComponent
