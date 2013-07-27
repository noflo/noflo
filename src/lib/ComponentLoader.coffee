#     NoFlo - Flow-Based Programming for Node.js
#     (c) 2013 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# This is the browser version of the ComponentLoader.
internalSocket = require './InternalSocket'

class ComponentLoader
  constructor: (@baseDir) ->
    @components = null
    @checked = []
    @revalidate = false

  getModulePrefix: (name) ->
    return '' unless name
    return '' if name is 'noflo'
    name.replace 'noflo-', ''

  getModuleComponents: (moduleName) ->
    return unless @checked.indexOf(moduleName) is -1
    @checked.push moduleName
    try
      definition = require "/#{moduleName}/component.json"
    catch e
      return

    for dependency of definition.dependencies
      @getModuleComponents dependency.replace '/', '-'

    return unless definition.noflo

    prefix = @getModulePrefix definition.name
    if definition.noflo.components
      for name, cPath of definition.noflo.components
        @registerComponent prefix, name, "/#{moduleName}/#{cPath}"
    if definition.noflo.graphs
      for name, cPath of definition.noflo.graphs
        @registerComponent prefix, name, "/#{moduleName}/#{cPath}"

  listComponents: (callback) ->
    return callback @components unless @components is null

    @components = {}

    @getModuleComponents @baseDir

    callback @components

  load: (name, callback) ->
    unless @components
      @listComponents (components) =>
        @load name, callback
      return
    component = @components[name]
    unless component
      # Try an alias
      for componentName of @components
        if componentName.split('/')[1] is name
          component = @components[componentName]
          break
      unless component
        # Failure to load
        throw new Error "Component #{name} not available"
        return

    if @isGraph component
      if typeof process is 'object' and process.title is 'node'
        # nextTick is faster on Node.js
        process.nextTick =>
          @loadGraph name, callback
      else
        setTimeout =>
          @loadGraph name, callback
        , 0
      return
    if typeof component is 'function'
      implementation = component
      instance = new component
    else
      implementation = require component
      instance = implementation.getComponent()
    instance.baseDir = @baseDir if name is 'Graph'
    callback instance

  isGraph: (cPath) ->
    return false unless typeof cPath is 'string'
    cPath.indexOf('.fbp') isnt -1 or cPath.indexOf('.json') isnt -1

  loadGraph: (name, callback) ->
    graphImplementation = require @components['Graph']
    graphSocket = internalSocket.createSocket()
    graph = graphImplementation.getComponent()
    graph.baseDir = @baseDir
    graph.inPorts.graph.attach graphSocket
    graphSocket.send @components[name]
    graphSocket.disconnect()
    delete graph.inPorts.graph
    callback graph

  registerComponent: (packageId, name, cPath, callback) ->
    prefix = @getModulePrefix packageId
    fullName = "#{prefix}/#{name}"
    fullName = name unless packageId
    @components[fullName] = cPath
    do callback if callback

  registerGraph: (packageId, name, gPath, callback) ->
    @registerComponent packageId, name, gPath, callback

  clear: ->
    @components = null
    @checked = []
    @revalidate = true

exports.ComponentLoader = ComponentLoader
