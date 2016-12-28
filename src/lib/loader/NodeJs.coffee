path = require 'path'
fs = require 'fs'
manifest = require 'fbp-manifest'
utils = require '../Utils'
nofloGraph = require '../Graph'

# We allow components to be un-compiled CoffeeScript
CoffeeScript = require 'coffee-script'
if typeof CoffeeScript.register != 'undefined'
  CoffeeScript.register()

registerModules = (loader, modules, callback) ->
  compatible = modules.filter (m) -> m.runtime in ['noflo', 'noflo-nodejs']
  componentLoaders = []
  for m in compatible
    loader.setLibraryIcon m.name, m.icon if m.icon

    if m.noflo?.loader
      loaderPath = path.resolve loader.baseDir, m.base, m.noflo.loader
      componentLoaders.push loaderPath

    for c in m.components
      loader.registerComponent m.name, c.name, path.resolve loader.baseDir, c.path

  return callback null unless componentLoaders.length
  done = ->
    if --componentLoaders.length < 1
      return callback.apply this, arguments
    return
  componentLoaders.forEach (loaderPath) =>
    cLoader = require loaderPath
    loader.registerLoader cLoader, (err) ->
      return callback err if err
      done null

manifestLoader =
  writeCache: (loader, options, manifest, callback) ->
    filePath = path.resolve loader.baseDir, options.manifest
    fs.writeFile filePath, JSON.stringify(manifest, null, 2),
      encoding: 'utf-8'
    , callback

  readCache: (loader, options, callback) ->
    options.discover = false
    manifest.load.load loader.baseDir, options, callback

  prepareManifestOptions: (loader) ->
    loader.options = {} unless loader.options
    options = {}
    options.runtimes = loader.options.runtimes or []
    options.runtimes.push 'noflo' if options.runtimes.indexOf('noflo') is -1
    options.recursive = if typeof loader.options.recursive is 'undefined' then true else loader.options.recursive
    options.manifest = 'fbp.json' unless options.manifest
    options

  listComponents: (loader, manifestOptions, callback) ->
    @readCache loader, manifestOptions, (err, manifest) =>
      if err
        return callback err unless loader.options.discover
        dynamicLoader.listComponents loader, manifestOptions, (err, modules) =>
          return callback err if err
          @writeCache loader, manifestOptions,
            version: 1
            modules: modules
          , (err) ->
            return callback err if err
            callback null, modules
        return
      registerModules loader, manifest.modules, (err) ->
        return callback err if err
        callback null, manifest.modules

dynamicLoader =
  listComponents: (loader, manifestOptions, callback) ->
    manifestOptions.discover = true
    manifest.list.list loader.baseDir, manifestOptions, (err, modules) =>
      return callback err if err
      registerModules loader, modules, (err) ->
        return callback err if err
        callback null, modules

registerSubgraph = (loader) ->
  # Inject subgraph component
  if path.extname(__filename) is '.js'
    graphPath = path.resolve __dirname, '../../src/components/Graph.coffee'
  else
    graphPath = path.resolve __dirname, '../../components/Graph.coffee'
  loader.registerComponent null, 'Graph', graphPath

exports.register = (loader, callback) ->
  manifestOptions = manifestLoader.prepareManifestOptions loader

  if loader.options?.cache
    manifestLoader.listComponents loader, manifestOptions, (err, modules) ->
      return callback err if err
      registerSubgraph loader
      callback null, modules
    return

  dynamicLoader.listComponents loader, manifestOptions, (err, modules) ->
    return callback err if err
    registerSubgraph loader
    callback null, modules

exports.dynamicLoad = (name, cPath, metadata, callback) ->
  try
    implementation = require cPath
  catch e
    callback e
    return

  if typeof implementation.getComponent is 'function'
    instance = implementation.getComponent metadata
  else if typeof implementation is 'function'
    instance = implementation metadata
  else
    callback new Error "Unable to instantiate #{cPath}"
    return
  instance.componentName = name if typeof name is 'string'
  callback null, instance

exports.setSource = (loader, packageId, name, source, language, callback) ->
  Module = require 'module'
  if language is 'coffeescript'
    try
      source = CoffeeScript.compile source,
        bare: true
    catch e
      return callback e
  else if language in ['es6', 'es2015']
    try
      babel = require 'babel-core'
      source = babel.transform(source).code
    catch e
      return callback e

  try
    # Use the Node.js module API to evaluate in the correct directory context
    modulePath = path.resolve loader.baseDir, "./components/#{name}.js"
    moduleImpl = new Module modulePath, module
    moduleImpl.paths = Module._nodeModulePaths path.dirname modulePath
    moduleImpl.filename = modulePath
    moduleImpl._compile source, modulePath
    implementation = moduleImpl.exports
  catch e
    return callback e
  unless implementation or implementation.getComponent
    return callback new Error 'Provided source failed to create a runnable component'

  loader.registerComponent packageId, name, implementation, callback

exports.getSource = (loader, name, callback) ->
  component = loader.components[name]
  unless component
    # Try an alias
    for componentName of loader.components
      if componentName.split('/')[1] is name
        component = loader.components[componentName]
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

  if loader.isGraph component
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
