#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2014 TheGrid (Rituwall Inc.)
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# Baseclass for regular NoFlo components.
{EventEmitter} = require 'events'

ports = require './Ports'
IP = require './IP'

class Component extends EventEmitter
  description: ''
  icon: null
  started: false
  load: 0
  ordered: false
  outputQ: []
  activateOnInput: true

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

    @description = options.description if options.description
    @ordered = options.ordered if 'ordered' of options
    @activateOnInput = options.activateOnInput if 'activateOnInput' of options

    if typeof options.process is 'function'
      @process options.process

  getDescription: -> @description

  isReady: -> true

  isSubgraph: -> false

  setIcon: (@icon) ->
    @emit 'icon', @icon
  getIcon: -> @icon

  error: (e, groups = [], errorPort = 'error') =>
    if @outPorts[errorPort] and (@outPorts[errorPort].isAttached() or not @outPorts[errorPort].isRequired())
      @outPorts[errorPort].beginGroup group for group in groups
      @outPorts[errorPort].send e
      @outPorts[errorPort].endGroup() for group in groups
      @outPorts[errorPort].disconnect()
      return
    throw e

  shutdown: ->
    @started = false

  # The startup function performs initialization for the component.
  start: ->
    @started = true
    @started

  isStarted: -> @started

  # Sets process handler function
  process: (handle) ->
    unless typeof handle is 'function'
      throw new Error "Process handler must be a function"
    unless @inPorts
      throw new Error "Component ports must be defined before process function"
    @handle = handle
    for name, port of @inPorts.ports
      port.name = name unless port.name
      port.on 'ip', (ip) =>
        @handleIP ip, port
    @

  handleIP: (ip, port) ->
    return unless port.options.triggering
    result = {}
    input = new ProcessInput @inPorts, ip, @, port, result
    output = new ProcessOutput @outPorts, ip, @, result
    @load++
    @handle input, output, -> output.done()

exports.Component = Component

class ProcessInput
  constructor: (@ports, @ip, @nodeInstance, @port, @result) ->
    @scope = @ip.scope

  activate: ->
    @result.__resolved = false
    if @nodeInstance.ordered
      @nodeInstance.outputQ.push @result

  has: ->
    res = true
    res and= @ports[port].ready @scope for port in arguments
    res

  get: ->
    if @nodeInstance.ordered and
    @nodeInstance.activateOnInput and
    not ('__resolved' of @result)
      @activate()
    res = (@ports[port].get @scope for port in arguments)
    if arguments.length is 1 then res[0] else res

  getData: ->
    ips = @get.apply this, arguments
    if arguments.length is 1
      return ips.data
    (ip.data for ip in ips)

class ProcessOutput
  constructor: (@ports, @ip, @nodeInstance, @result) ->
    @scope = @ip.scope

  activate: ->
    @result.__resolved = false
    if @nodeInstance.ordered
      @nodeInstance.outputQ.push @result

  isError: (err) ->
    err instanceof Error or
    Array.isArray(err) and err.length > 0 and err[0] instanceof Error

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

  sendIP: (port, packet) ->
    if typeof packet isnt 'object' or
    IP.types.indexOf(packet.type) is -1
      ip = new IP 'data', packet
    else
      ip = packet
    ip.scope = @scope if @scope isnt null and ip.scope is null
    if @nodeInstance.ordered
      @result[port] = [] unless port of @result
      @result[port].push ip
    else
      @nodeInstance.outPorts[port].sendIP ip

  send: (outputMap) ->
    if @nodeInstance.ordered and
    not ('__resolved' of @result)
      @activate()
    return @error outputMap if @isError outputMap
    for port, packet of outputMap
      @sendIP port, packet

  sendDone: (outputMap) ->
    @send outputMap
    @done()

  done: (error) ->
    @error error if error
    if @nodeInstance.ordered
      @result.__resolved = true
      while @nodeInstance.outputQ.length > 0
        result = @nodeInstance.outputQ[0]
        break unless result.__resolved
        for port, ips of result
          continue if port is '__resolved'
          for ip in ips
            @nodeInstance.outPorts[port].sendIP ip
        @nodeInstance.outputQ.shift()
    @nodeInstance.load--
