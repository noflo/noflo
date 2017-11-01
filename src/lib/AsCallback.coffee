#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2017 Flowhub UG
#     NoFlo may be freely distributed under the MIT license
#
# asCallback helper embedding NoFlo components or graphs in other JavaScript programs.
ComponentLoader = require('./ComponentLoader').ComponentLoader
Network = require('./Network').Network
IP = require('./IP')
internalSocket = require './InternalSocket'
Graph = require('fbp-graph').Graph

normalizeOptions = (options, component) ->
  options = {} unless options
  options.name = component unless options.name
  if options.loader
    options.baseDir = options.loader.baseDir
  if not options.baseDir and process and process.cwd
    options.baseDir = process.cwd()
  unless options.loader
    options.loader = new ComponentLoader options.baseDir
  options.raw = false unless options.raw
  options

prepareNetwork = (component, options, callback) ->
  # Start by loading the component
  options.loader.load component, (err, instance) ->
    return callback err if err
    # Prepare a graph wrapping the component
    graph = new Graph options.name
    nodeName = options.name
    graph.addNode nodeName, component
    # Expose ports
    inPorts = instance.inPorts.ports
    outPorts = instance.outPorts.ports
    for port, def of inPorts
      graph.addInport port, nodeName, port
    for port, def of outPorts
      graph.addOutport port, nodeName, port
    # Prepare network
    graph.componentLoader = options.loader
    network = new Network graph, options
    # Wire the network up and start execution
    network.connect (err) ->
      return callback err if err
      callback null, network

runNetwork = (network, inputs, options, callback) ->
  process = network.getNode options.name
  # Prepare inports
  inPorts = Object.keys network.graph.inports
  inSockets = {}
  inPorts.forEach (inport) ->
    inSockets[inport] = internalSocket.createSocket()
    process.component.inPorts[inport].attach inSockets[inport]
  # Subscribe outports
  received = []
  outPorts = Object.keys network.graph.outports
  outSockets = {}
  outPorts.forEach (outport) ->
    outSockets[outport] = internalSocket.createSocket()
    process.component.outPorts[outport].attach outSockets[outport]
    outSockets[outport].on 'ip', (ip) ->
      res = {}
      res[outport] = ip
      received.push res
  # Subscribe network finish
  network.once 'end', ->
    # Clear listeners
    for port, socket of outSockets
      process.component.outPorts[port].detach socket
    outSockets = {}
    inSockets = {}
    callback null, received
  # Start network
  network.start (err) ->
    return callback err if err
    # Send inputs
    for inputMap in inputs
      for port, value of inputMap
        if IP.isIP value
          inSockets[port].post value
          continue
        inSockets[port].post new IP 'data', value

getType = (inputs, network) ->
  # Scalar values are always simple inputs
  return 'simple' unless typeof inputs is 'object'

  if Array.isArray inputs
    maps = inputs.filter (entry) ->
      getType(entry, network) is 'map'
    # If each member if the array is an input map, this is a sequence
    return 'sequence' if maps.length is inputs.length
    # Otherwise arrays must be simple inputs
    return 'simple'

  # Empty objects can't be maps
  return 'simple' unless Object.keys(inputs).length
  for key, value of inputs
    return 'simple' unless network.graph.inports[key]
  return 'map'

prepareInputMap = (inputs, inputType, network) ->
  # Sequence we can use as-is
  return inputs if inputType is 'sequence'
  # We can turn a map to a sequence by wrapping it in an array
  return [inputs] if inputType is 'map'
  # Simple inputs need to be converted to a sequence
  inPort = Object.keys(network.graph.inports)[0]
  # If we have a port named "IN", send to that
  inPort = 'in' if network.graph.inports.in
  map = {}
  map[inPort] = inputs
  return [map]

normalizeOutput = (values, options) ->
  return values if options.raw
  result = []
  previous = null
  current = result
  for packet in values
    if packet.type is 'openBracket'
      previous = current
      current = []
      previous.push current
    if packet.type is 'data'
      current.push packet.data
    if packet.type is 'closeBracket'
      current = previous
  if result.length is 1
    return result[0]
  return result

sendOutputMap = (outputs, resultType, options, callback) ->
  # First check if the output sequence contains errors
  errors = outputs.filter((map) -> map.error?).map (map) -> map.error
  return callback normalizeOutput errors, options if errors.length

  if resultType is 'sequence'
    return callback null, outputs.map (map) ->
      res = {}
      for key, val of map
        if options.raw
          res[key] = val
          continue
        res[key] = normalizeOutput [val], options
      return res

  # Flatten the sequence
  mappedOutputs = {}
  for map in outputs
    for key, val of map
      mappedOutputs[key] = [] unless mappedOutputs[key]
      mappedOutputs[key].push val

  outputKeys = Object.keys mappedOutputs
  withValue = outputKeys.filter (outport) ->
    mappedOutputs[outport].length > 0
  if withValue.length is 0
    # No output
    return callback null
  if withValue.length is 1 and resultType is 'simple'
    # Single outport
    return callback null, normalizeOutput mappedOutputs[withValue[0]], options
  result = {}
  for port, packets of mappedOutputs
    result[port] = normalizeOutput packets, options
  callback null, result

exports.asCallback = (component, options) ->
  options = normalizeOptions options, component
  return (inputs, callback) ->
    prepareNetwork component, options, (err, network) ->
      return callback err if err
      resultType = getType inputs, network
      inputMap = prepareInputMap inputs, resultType, network
      runNetwork network, inputMap, options, (err, outputMap) ->
        return callback err if err
        sendOutputMap outputMap, resultType, options, callback
