#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013 The Grid
#     (c) 2013 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# This is the browser version of the ComponentLoader.
internalSocket = require './InternalSocket'
nofloGraph = require './Graph'
unless require('./Platform').isBrowser()
  {EventEmitter} = require 'events'
else
  EventEmitter = require 'emitter'

class ComponentLoader extends EventEmitter
  constructor: (@baseDir) ->
    @components = null
    @checked = []
    @revalidate = false
    @libraryIcons = {}
    @processing = false
    @ready = false

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
        if cPath.substr(0, 2) is './'
          cPath = cPath.substr 2
        @registerComponent prefix, name, "/#{moduleName}/#{cPath}"
    if definition.noflo.graphs
      for name, cPath of definition.noflo.graphs
        @registerGraph prefix, name, "/#{moduleName}/#{cPath}"

  listComponents: (callback) ->
    if @processing
      @once 'ready', =>
        callback @components
      return
    return callback @components if @components

    @ready = false
    @processing = true
    setTimeout =>
      @components = {}

      @getModuleComponents @baseDir

      @processing = false
      @ready = true
      @emit 'ready', true
      callback @components if callback
    , 1

  load: (name, callback, delayed, metadata) ->
    unless @ready
      @listComponents =>
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

  normalizeName: (packageId, name) ->
    prefix = @getModulePrefix packageId
    fullName = "#{prefix}/#{name}"
    fullName = name unless packageId
    fullName

  registerComponent: (packageId, name, cPath, callback) ->
    fullName = @normalizeName packageId, name
    @components[fullName] = cPath
    do callback if callback

  registerGraph: (packageId, name, gPath, callback) ->
    @registerComponent packageId, name, gPath, callback

  setSource: (packageId, name, source, language, callback) ->
    unless @ready
      @listComponents =>
        @setSource packageId, name, source, language, callback
      return

    if language is 'coffeescript'
      unless window.CoffeeScript
        return callback new Error 'CoffeeScript compiler not available'
      try
        source = CoffeeScript.compile source,
          bare: true
      catch e
        return callback e

    # We eval the contents to get a runnable component
    try
      # Modify require path for NoFlo since we're inside the NoFlo context
      source = source.replace "require('noflo')", "require('./NoFlo')"
      source = source.replace 'require("noflo")', 'require("./NoFlo")'

      # Eval so we can get a function
      implementation = eval "(function () { var exports = {}; #{source}; return exports; })()"
    catch e
      return callback e
    unless implementation or implementation.getComponent
      return callback new Error 'Provided source failed to create a runnable component'
    @registerComponent packageId, name, implementation, ->
      callback null

  getSource: (name, callback) ->
    unless @ready
      @listComponents =>
        @getSource packageId, name, callback
      return

    component = @components[name]
    unless component
      # Try an alias
      for componentName of @components
        if componentName.split('/')[1] is name
          component = @components[componentName]
          name = componentName
          break
      unless component
        return callback new Error "Component #{name} not installed"

    if typeof component isnt 'string'
      return callback new Error "Can't provide source for #{name}. Not a file"

    path = window.require.resolve component
    unless path
      return callback new Error "Component #{name} is not resolvable to a path"
    nameParts = name.split '/'
    if nameParts.length is 1
      nameParts[1] = nameParts[0]
      nameParts[0] = ''
    callback null,
      name: nameParts[1]
      library: nameParts[0]
      code: window.require.modules[path].toString()

  clear: ->
    @components = null
    @checked = []
    @revalidate = true
    @ready = false
    @processing = false

exports.ComponentLoader = ComponentLoader
