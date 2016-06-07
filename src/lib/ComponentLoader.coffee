#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2016 TheGrid (Rituwall Inc.)
#     (c) 2013 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# This is the browser version of the ComponentLoader.
internalSocket = require './InternalSocket'
nofloGraph = require './Graph'
utils = require './Utils'
{EventEmitter} = require 'events'
registerLoader = require './loader/register'

class ComponentLoader extends EventEmitter
  constructor: (@baseDir, @options = {}) ->
    @components = null
    @libraryIcons = {}
    @processing = false
    @ready = false
    @setMaxListeners 0 if typeof @setMaxListeners is 'function'

  getModulePrefix: (name) ->
    return '' unless name
    return '' if name is 'noflo'
    name = name.replace /\@[a-z\-]+\//, '' if name[0] is '@'
    name.replace 'noflo-', ''

  listComponents: (callback) ->
    if @processing
      @once 'ready', =>
        callback null, @components
      return
    return callback null, @components if @components

    @ready = false
    @processing = true

    @components = {}
    registerLoader.register @, (err) =>
      if err
        return callback err if err
        throw err
      @processing = false
      @ready = true
      @emit 'ready', true
      callback null, @components if callback

  load: (name, callback, metadata) ->
    unless @ready
      @listComponents (err) =>
        return callback err if err
        @load name, callback, metadata
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
        callback new Error "Component #{name} not available with base #{@baseDir}"
        return

    if @isGraph component
      if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
        # nextTick is faster on Node.js
        process.nextTick =>
          @loadGraph name, component, callback, metadata
      else
        setTimeout =>
          @loadGraph name, component, callback, metadata
        , 0
      return

    @createComponent name, component, metadata, (err, instance) =>
      return callback err if err
      if not instance
        callback new Error "Component #{name} could not be loaded."
        return

      instance.baseDir = @baseDir if name is 'Graph'
      @setIcon name, instance
      callback null, instance

  # Creates an instance of a component.
  createComponent: (name, component, metadata, callback) ->
    implementation = component

    # If a string was specified, attempt to `require` it.
    if typeof implementation is 'string'
      if typeof registerLoader.dynamicLoad is 'function'
        registerLoader.dynamicLoad name, implementation, metadata, callback
        return
      return callback Error "Dynamic loading of #{implementation} for component #{name} not available on this platform."

    # Attempt to create the component instance using the `getComponent` method.
    if typeof implementation.getComponent is 'function'
      instance = implementation.getComponent metadata
    # Attempt to create a component using a factory function.
    else if typeof implementation is 'function'
      instance = implementation metadata
    else
      callback new Error "Invalid type #{typeof(implementation)} for component #{name}."
      return

    instance.componentName = name if typeof name is 'string'
    callback null, instance

  isGraph: (cPath) ->
    return true if typeof cPath is 'object' and cPath instanceof nofloGraph.Graph
    return false unless typeof cPath is 'string'
    cPath.indexOf('.fbp') isnt -1 or cPath.indexOf('.json') isnt -1

  loadGraph: (name, component, callback, metadata) ->
    graphImplementation = @components['Graph']
    unless graphImplementation
      return callback "Subgraph support not available"
    graphSocket = internalSocket.createSocket()
    graph = graphImplementation.getComponent metadata
    graph.loader = @
    graph.baseDir = @baseDir
    graph.inPorts.graph.attach graphSocket
    graph.componentName = name if typeof name is 'string'
    graphSocket.send component
    graphSocket.disconnect()
    graph.inPorts.remove 'graph'
    @setIcon name, graph
    callback null, graph

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

  setLibraryIcon: (prefix, icon) ->
    @libraryIcons[prefix] = icon

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

  registerLoader: (loader, callback) ->
    loader @, callback

  setSource: (packageId, name, source, language, callback) ->
    unless registerLoader.setSource
      return callback new Error 'setSource not allowed'

    unless @ready
      @listComponents (err) =>
        return callback err if err
        @setSource packageId, name, source, language, callback
      return

    registerLoader.setSource @, packageId, name, source, language, callback

  getSource: (name, callback) ->
    unless registerLoader.getSource
      return callback new Error 'getSource not allowed'
    unless @ready
      @listComponents (err) =>
        return callback err if err
        @getSource name, callback
      return

    registerLoader.getSource @, name, callback

  clear: ->
    @components = null
    @ready = false
    @processing = false

exports.ComponentLoader = ComponentLoader
