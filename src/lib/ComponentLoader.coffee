#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013 The Grid
#     (c) 2013 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# This is the browser version of the ComponentLoader.
internalSocket = require './InternalSocket'
nofloGraph = require './Graph'

class ComponentLoader
  constructor: (@baseDir) ->
    @components = null
    @checked = []
    @revalidate = false
    @libraryIcons = {}

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
      if moduleName.substr(0, 1) is '/'
        return @getModuleComponents "noflo-#{moduleName.substr(1)}"
      return

    for dependency of definition.dependencies
      @getModuleComponents dependency.replace '/', '-'

    return unless definition.noflo

    prefix = @getModulePrefix definition.name

    if definition.noflo.icon
      @libraryIcons[prefix] = definition.noflo.icon

    if moduleName[0] is '/'
      moduleName = moduleName.substr 1
    if definition.noflo.loader
      # Run a custom component loader
      loader = require "/#{moduleName}/#{definition.noflo.loader}"
      loader @
    if definition.noflo.components
      for name, cPath of definition.noflo.components
        if cPath.indexOf('.coffee') isnt -1
          cPath = cPath.replace '.coffee', '.js'
        @registerComponent prefix, name, "/#{moduleName}/#{cPath}"
    if definition.noflo.graphs
      for name, cPath of definition.noflo.graphs
        @registerComponent prefix, name, "/#{moduleName}/#{cPath}"

  listComponents: (callback) ->
    return callback @components unless @components is null

    @components = {}

    @getModuleComponents @baseDir

    callback @components

  load: (name, callback, delayed, metadata) ->
    unless @components
      @listComponents (components) =>
        @load name, callback, delayed, metadata
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
        throw new Error "Component #{name} not available with base #{@baseDir}"
        return

    if @isGraph component
      if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
        # nextTick is faster on Node.js
        process.nextTick =>
          @loadGraph name, component, callback, delayed, metadata
      else
        setTimeout =>
          @loadGraph name, component, callback, delayed, metadata
        , 0
      return
    if typeof component is 'function'
      implementation = component
      if component.getComponent and typeof component.getComponent is 'function'
        instance = component.getComponent metadata
      else
        instance = component metadata
    # Direct component instance, return as is
    else if typeof component is 'object' and typeof component.getComponent is 'function'
      instance = component.getComponent metadata
    else
      implementation = require component
      if implementation.getComponent and typeof implementation.getComponent is 'function'
        instance = implementation.getComponent metadata
      else
        instance = implementation metadata
    instance.baseDir = @baseDir if name is 'Graph'
    @setIcon name, instance
    callback instance

  isGraph: (cPath) ->
    return true if typeof cPath is 'object' and cPath instanceof nofloGraph.Graph
    return false unless typeof cPath is 'string'
    cPath.indexOf('.fbp') isnt -1 or cPath.indexOf('.json') isnt -1

  loadGraph: (name, component, callback, delayed, metadata) ->
    graphImplementation = require @components['Graph']
    graphSocket = internalSocket.createSocket()
    graph = graphImplementation.getComponent metadata
    graph.loader = @
    graph.baseDir = @baseDir

    if delayed
      delaySocket = internalSocket.createSocket()
      graph.inPorts.start.attach delaySocket

    graph.inPorts.graph.attach graphSocket
    graphSocket.send component
    graphSocket.disconnect()
    graph.inPorts.remove 'graph'
    graph.inPorts.remove 'start'
    @setIcon name, graph
    callback graph

  setIcon: (name, instance) ->
    # See if component has an icon
    return if not instance.getIcon or instance.getIcon()

    # See if library has an icon
    [library, componentName] = name.split '/'
    if componentName and @getLibraryIcon library
      instance.setIcon @getLibraryIcon library
      return

    # See if instance is a subgraph
    if instance.isSubgraph()
      instance.setIcon 'sitemap'
      return

    instance.setIcon 'square'
    return

  getLibraryIcon: (prefix) ->
    if @libraryIcons[prefix]
      return @libraryIcons[prefix]
    return null

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
