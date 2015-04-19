#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2014 TheGrid (Rituwall Inc.)
#     (c) 2013 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# This is the browser version of the ComponentLoader.
internalSocket = require './InternalSocket'
nofloGraph = require './Graph'
utils = require './Utils'
{EventEmitter} = require 'events'

class ComponentLoader extends EventEmitter
  constructor: (@baseDir, @options = {}) ->
    @components = null
    @componentLoaders = []
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
      loaderPath = "/#{moduleName}/#{definition.noflo.loader}"
      @componentLoaders.push loaderPath
      loader = require loaderPath
      @registerLoader loader, ->
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

  load: (name, callback, metadata) ->
    unless @ready
      @listComponents =>
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
      try
        implementation = require implementation
      catch e
        return callback e

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
    graphImplementation = require @components['Graph']
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
        @getSource name, callback
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

    nameParts = name.split '/'
    if nameParts.length is 1
      nameParts[1] = nameParts[0]
      nameParts[0] = ''

    if @isGraph component
      nofloGraph.loadFile component, (graph) ->
        return callback new Error 'Unable to load graph' unless graph
        callback null,
          name: nameParts[1]
          library: nameParts[0]
          code: JSON.stringify graph.toJSON()
          language: 'json'
      return

    path = window.require.resolve component
    unless path
      return callback new Error "Component #{name} is not resolvable to a path"
    callback null,
      name: nameParts[1]
      library: nameParts[0]
      code: window.require.modules[path].toString()
      language: utils.guessLanguageFromFilename component

  clear: ->
    @components = null
    @checked = []
    @revalidate = true
    @ready = false
    @processing = false

exports.ComponentLoader = ComponentLoader
