#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2016 TheGrid (Rituwall Inc.)
#     (c) 2013 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# This is the Node.js version of the ComponentLoader.

{_} = require 'underscore'
path = require 'path'
fs = require 'fs'
loader = require '../ComponentLoader'
internalSocket = require '../InternalSocket'
utils = require '../Utils'
nofloGraph = require '../Graph'
manifest = require 'fbp-manifest'

# We allow components to be un-compiled CoffeeScript
CoffeeScript = require 'coffee-script'
if typeof CoffeeScript.register != 'undefined'
  CoffeeScript.register()
babel = require 'babel-core'

class ComponentLoader extends loader.ComponentLoader
  writeCache: (options, modules, callback) ->
    filePath = path.resolve @baseDir, options.manifest
    fs.writeFile filePath, JSON.stringify(modules, null, 2),
      encoding: 'utf-8'
    , callback

  readCache: (options, callback) ->
    options.discover = false
    manifest.load.load @baseDir, options, callback

  prepareManifestOptions: ->
    options = {}
    options.runtimes = @options.runtimes or []
    options.runtimes.push 'noflo' if options.runtimes.indexOf('noflo') is -1
    options.recursive = if typeof @options.recursive is 'undefined' then true else @options.recursive
    options.manifest = 'fbp.json' unless options.manifest
    options

  readModules: (modules, callback) ->
    compatible = modules.filter (m) -> m.runtime in ['noflo', 'noflo-nodejs']
    for m in compatible
      @libraryIcons[m.name] = m.icon if m.icon

      if m.noflo?.loader
        loaderPath = path.resolve @baseDir, m.base, m.noflo.loader
        @componentLoaders.push loaderPath

      for c in m.components
        @components["#{m.name}/#{c.name}"] = path.resolve @baseDir, c.path

    # Inject subgraph component
    if path.extname(__filename) is '.js'
      @components.Graph = path.resolve __dirname, '../../components/Graph.js'
    else
      @components.Graph = path.resolve __dirname, '../../components/Graph.coffee'

    return callback null unless @componentLoaders.length
    done = _.after @componentLoaders.length, callback
    @componentLoaders.forEach (loaderPath) =>
      loader = require loaderPath
      @registerLoader loader, (err) ->
        return callback err if err
        done null

  listComponents: (callback) ->
    if @processing
      @once 'ready', =>
        callback null, @components
      return
    return callback null, @components if @components

    @ready = false
    @processing = true

    manifestOptions = @prepareManifestOptions()

    if @options.cache and not @failedCache
      @readCache manifestOptions, (err, modules) =>
        if err
          @failedCache = true
          @processing = false
          return callback err
        @components = {}
        @readModules modules, (err) =>
          @ready = true
          @processing = false
          @emit 'ready', true
          callback null, @components if callback
      return

    @components = {}
    manifest.list.list @baseDir, manifestOptions, (err, modules) =>
      @readModules modules, (err) =>
        @processing = false
        return callback err if err
        @ready = true
        @emit 'ready', true
        return callback null, @components unless @options.cache
        @writeCache manifestOptions, modules, (err) =>
          return callback err if err
          callback null, @components

  setSource: (packageId, name, source, language, callback) ->
    unless @ready
      @listComponents (err) =>
        return callback err if err
        @setSource packageId, name, source, language, callback
      return

    Module = require 'module'
    if language is 'coffeescript'
      try
        source = CoffeeScript.compile source,
          bare: true
      catch e
        return callback e
    else if language in ['es6', 'es2015']
      try
        source = babel.transform(source).code
      catch e
        return callback e

    try
      # Use the Node.js module API to evaluate in the correct directory context
      modulePath = path.resolve @baseDir, "./components/#{name}.js"
      moduleImpl = new Module modulePath, module
      moduleImpl.paths = Module._nodeModulePaths path.dirname modulePath
      moduleImpl.filename = modulePath
      moduleImpl._compile source, modulePath
      implementation = moduleImpl.exports
    catch e
      return callback e
    unless implementation or implementation.getComponent
      return callback new Error 'Provided source failed to create a runnable component'
    @registerComponent packageId, name, implementation, ->
      callback null

  getSource: (name, callback) ->
    unless @ready
      @listComponents (err) =>
        return callback err if err
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
      nofloGraph.loadFile component, (err, graph) ->
        return callback err if err
        return callback new Error 'Unable to load graph' unless graph
        callback null,
          name: nameParts[1]
          library: nameParts[0]
          code: JSON.stringify graph.toJSON()
          language: 'json'
      return

    fs.readFile component, 'utf-8', (err, code) ->
      return callback err if err
      callback null,
        name: nameParts[1]
        library: nameParts[0]
        language: utils.guessLanguageFromFilename component
        code: code

exports.ComponentLoader = ComponentLoader
