#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2017 Flowhub UG
#     (c) 2013 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
fbpGraph = require 'fbp-graph'
{EventEmitter} = require 'events'
registerLoader = require './loader/register'
platform = require './Platform'

# ## The NoFlo Component Loader
#
# The Component Loader is responsible for discovering components
# available in the running system, as well as for instantiating
# them.
#
# Internally the loader uses a registered, platform-specific
# loader. NoFlo ships with a loader for Node.js that discovers
# components from the current project's `components/` and
# `graphs/` folders, as well as those folders of any installed
# NPM dependencies. For browsers and embedded devices it is
# possible to generate a statically configured component
# loader using the [noflo-component-loader](https://github.com/noflo/noflo-component-loader) webpack plugin.
class ComponentLoader extends EventEmitter
  constructor: (baseDir, options = {}) ->
    super()
    @baseDir = baseDir
    @options = options
    @components = null
    @libraryIcons = {}
    @processing = false
    @ready = false
    @setMaxListeners 0

  # Get the library prefix for a given module name. This
  # is mostly used for generating valid names for namespaced
  # NPM modules, as well as for convenience renaming all
  # `noflo-` prefixed modules with just their base name.
  #
  # Examples:
  #
  # * `my-project` becomes `my-project`
  # * `@foo/my-project` becomes `my-project`
  # * `noflo-core` becomes `core`
  getModulePrefix: (name) ->
    return '' unless name
    return '' if name is 'noflo'
    name = name.replace /\@[a-z\-]+\//, '' if name[0] is '@'
    name.replace /^noflo-/, ''

  # Get the list of all available components
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
        return callback err if callback
        throw err
      @processing = false
      @ready = true
      @emit 'ready', true
      callback null, @components if callback
    return

  # Load an instance of a specific component. If the
  # registered component is a JSON or FBP graph, it will
  # be loaded as an instance of the NoFlo subgraph
  # component.
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
      unless platform.isBrowser()
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
      instance.componentName = name if typeof name is 'string'

      if instance.isLegacy()
        platform.deprecated "Component #{name} uses legacy NoFlo APIs. Please port to Process API"

      @setIcon name, instance
      callback null, instance

  # Creates an instance of a component.
  createComponent: (name, component, metadata, callback) ->
    implementation = component
    unless implementation
      return callback new Error "Component #{name} not available"

    # If a string was specified, attempt to `require` it.
    if typeof implementation is 'string'
      if typeof registerLoader.dynamicLoad is 'function'
        registerLoader.dynamicLoad name, implementation, metadata, callback
        return
      return callback Error "Dynamic loading of #{implementation} for component #{name} not available on this platform."

    # Attempt to create the component instance using the `getComponent` method.
    if typeof implementation.getComponent is 'function'
      try
        instance = implementation.getComponent metadata
      catch e
        return callback e
    # Attempt to create a component using a factory function.
    else if typeof implementation is 'function'
      try
        instance = implementation metadata
      catch e
        return callback e
    else
      callback new Error "Invalid type #{typeof(implementation)} for component #{name}."
      return

    callback null, instance

  # Check if a given filesystem path is actually a graph
  isGraph: (cPath) ->
    # Live graph instance
    return true if typeof cPath is 'object' and cPath instanceof fbpGraph.Graph
    # Graph JSON definition
    return true if typeof cPath is 'object' and cPath.processes and cPath.connections
    return false unless typeof cPath is 'string'
    # Graph file path
    cPath.indexOf('.fbp') isnt -1 or cPath.indexOf('.json') isnt -1

  # Load a graph as a NoFlo subgraph component instance
  loadGraph: (name, component, callback, metadata) ->
    @createComponent name, @components['Graph'], metadata, (err, graph) =>
      return callback err if err
      graph.loader = @
      graph.baseDir = @baseDir
      graph.inPorts.remove 'graph'
      graph.setGraph component, (err) =>
        return callback err if err
        @setIcon name, graph
        callback null, graph
      return
    return

  # Set icon for the component instance. If the instance
  # has an icon set, then this is a no-op. Otherwise we
  # determine an icon based on the module it is coming
  # from, or use a fallback icon separately for subgraphs
  # and elementary components.
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

    instance.setIcon 'gear'
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

  # ### Registering components at runtime
  #
  # In addition to components discovered by the loader,
  # it is possible to register components at runtime.
  #
  # With the `registerComponent` method you can register
  # a NoFlo Component constructor or factory method
  # as a component available for loading.
  registerComponent: (packageId, name, cPath, callback) ->
    fullName = @normalizeName packageId, name
    @components[fullName] = cPath
    do callback if callback

  # With the `registerGraph` method you can register new
  # graphs as loadable components.
  registerGraph: (packageId, name, gPath, callback) ->
    @registerComponent packageId, name, gPath, callback

  # With `registerLoader` you can register custom component
  # loaders. They will be called immediately and can register
  # any components or graphs they wish.
  registerLoader: (loader, callback) ->
    loader @, callback

  # With `setSource` you can register a component by providing
  # a source code string. Supported languages and techniques
  # depend on the runtime environment, for example CoffeeScript
  # components can only be registered via `setSource` if
  # the environment has a CoffeeScript compiler loaded.
  setSource: (packageId, name, source, language, callback) ->
    unless registerLoader.setSource
      return callback new Error 'setSource not allowed'

    unless @ready
      @listComponents (err) =>
        return callback err if err
        @setSource packageId, name, source, language, callback
      return

    registerLoader.setSource @, packageId, name, source, language, callback

  # `getSource` allows fetching the source code of a registered
  # component as a string.
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
