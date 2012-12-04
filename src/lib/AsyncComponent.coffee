port = require "./Port"
component = require "./Component"

class AsyncComponent extends component.Component

  constructor: (@inPortName="in", @outPortName="out", @errPortName="error") ->
    throw new Error "no inPort named '#{@inPortName}'" unless (@inPortName of @inPorts)
    throw new Error "no outPort named '#{@outPortName}'" unless (@outPortName of @outPorts)

    @load = 0
    @q = []

    @outPorts.load = new port.Port()

    @inPorts[@inPortName].on "begingroup", (group) =>
      return @q.push { name: "begingroup", data: group } if @load > 0
      @outPorts[@outPortName].beginGroup group

    @inPorts[@inPortName].on "endgroup", =>
      return @q.push { name: "endgroup" } if @load > 0
      @outPorts[@outPortName].endGroup()

    @inPorts[@inPortName].on "disconnect", =>
      return @q.push { name: "disconnect" } if @load > 0
      @outPorts[@outPortName].disconnect()

    @inPorts[@inPortName].on "data", (data) =>
      return @q.push { name: "data", data: data } if @q.length > 0
      @processData data

  processData: (data) ->
    @incrementLoad()
    @doAsync data, (err) =>
      if err
        if (@errPortName of @outPorts)
          @outPorts[@errPortName].send err
          @outPorts[@errPortName].disconnect()
        else throw err
      @decrementLoad()

  incrementLoad: ->
    @load++
    @outPorts.load.send @load if @outPorts.load.socket

  doAsync: (data, callback) ->
    callback new Error "AsyncComponents must implement doAsync"

  decrementLoad: ->
    throw new Error "load cannot be negative" if @load == 0
    @load--
    @outPorts.load.send @load if @outPorts.load.socket
    process.nextTick => @processQueue()

  processQueue: ->
    return if @load > 0
    processedData = false
    while @q.length > 0
      event = @q[0]
      switch event.name
        when "begingroup"
          return if processedData
          @outPorts[@outPortName].beginGroup event.data
          @q.shift()
        when "endgroup"
          return if processedData
          @outPorts[@outPortName].endGroup()
          @q.shift()
        when "disconnect"
          return if processedData
          @outPorts[@outPortName].disconnect()
          @q.shift()
        when "data"
          @processData event.data
          @q.shift()
          processedData = true

exports.AsyncComponent = AsyncComponent
