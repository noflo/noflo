path = require 'path'
fs = require 'fs'
manifest = require 'fbp-manifest'
utils = require '../Utils'
fbpGraph = require 'fbp-graph'

# We allow components to be un-compiled CoffeeScript
CoffeeScript = require 'coffeescript'
if typeof CoffeeScript.register != 'undefined'
  CoffeeScript.register()

registerCustomLoaders = (loader, componentLoaders, callback) ->
  unless componentLoaders.length
    callback null
    return
  customLoader = require componentLoaders.shift()
  loader.registerLoader customLoader, (err) ->
    if err
      callback err
      return
    registerCustomLoaders loader, componentLoaders, callback
    return
  return

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

  registerCustomLoaders loader, componentLoaders, callback
  return

manifestLoader =
  writeCache: (loader, options, manifest, callback) ->
    filePath = path.resolve loader.baseDir, options.manifest
    fs.writeFile filePath, JSON.stringify(manifest, null, 2),
      encoding: 'utf-8'
    , callback
    return

  readCache: (loader, options, callback) ->
    options.discover = false
    manifest.load.load loader.baseDir, options, callback
    return

  prepareManifestOptions: (loader) ->
    loader.options = {} unless loader.options
    options = {}
    options.runtimes = loader.options.runtimes or []
    options.runtimes.push 'noflo' if options.runtimes.indexOf('noflo') is -1
    options.recursive = if typeof loader.options.recursive is 'undefined' then true else loader.options.recursive
    options.manifest = loader.options.manifest or 'fbp.json'
    return options

  listComponents: (loader, manifestOptions, callback) ->
    @readCache loader, manifestOptions, (err, manifest) =>
      if err
        unless loader.options.discover
          callback err 
          return
        dynamicLoader.listComponents loader, manifestOptions, (err, modules) =>
          if err
            callback err
            return
          @writeCache loader, manifestOptions,
            version: 1
            modules: modules
          , (err) ->
            if err
              callback err
              return
            callback null, modules
            return
        return
      registerModules loader, manifest.modules, (err) ->
        if err
          callback err
          return
        callback null, manifest.modules
        return
      return
    return

dynamicLoader =
  listComponents: (loader, manifestOptions, callback) ->
    manifestOptions.discover = true
    manifest.list.list loader.baseDir, manifestOptions, (err, modules) =>
      if err
        callback err
        return
      registerModules loader, modules, (err) ->
        if err
          callback err
          return
        callback null, modules
        return
      return
    return

registerSubgraph = (loader) ->
  # Inject subgraph component
  if path.extname(__filename) is '.js'
    graphPath = path.resolve __dirname, '../../components/Graph.js'
  else
    graphPath = path.resolve __dirname, '../../components/Graph.coffee'
  loader.registerComponent null, 'Graph', graphPath
  return

exports.register = (loader, callback) ->
  manifestOptions = manifestLoader.prepareManifestOptions loader

  if loader.options?.cache
    manifestLoader.listComponents loader, manifestOptions, (err, modules) ->
      if err
        callback err
        return
      registerSubgraph loader
      callback null, modules
      return
    return

  dynamicLoader.listComponents loader, manifestOptions, (err, modules) ->
    if err
      callback err
      return
    registerSubgraph loader
    callback null, modules
    return
  return

exports.dynamicLoad = (name, cPath, metadata, callback) ->
  try
    implementation = require cPath
  catch e
    callback e
    return

  if typeof implementation.getComponent is 'function'
    try
      instance = implementation.getComponent metadata
    catch e
      callback e
      return
  else if typeof implementation is 'function'
    try
      instance = implementation metadata
    catch e
      callback e
      return
  else
    callback new Error "Unable to instantiate #{cPath}"
    return
  instance.componentName = name if typeof name is 'string'
  callback null, instance
  return

exports.setSource = (loader, packageId, name, source, language, callback) ->
  Module = require 'module'
  if language is 'coffeescript'
    try
      source = CoffeeScript.compile source,
        bare: true
    catch e
      callback e
      return
  try
    # Use the Node.js module API to evaluate in the correct directory context
    modulePath = path.resolve loader.baseDir, "./components/#{name}.js"
    moduleImpl = new Module modulePath, module
    moduleImpl.paths = Module._nodeModulePaths path.dirname modulePath
    moduleImpl.filename = modulePath
    moduleImpl._compile source, modulePath
    implementation = moduleImpl.exports
  catch e
    callback e
    return
  unless typeof implementation is 'function' or typeof implementation.getComponent is 'function'
    callback new Error 'Provided source failed to create a runnable component'
    return

  loader.registerComponent packageId, name, implementation, callback
  return

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
      callback new Error "Component #{name} not installed"
      return

  nameParts = name.split '/'
  if nameParts.length is 1
    nameParts[1] = nameParts[0]
    nameParts[0] = ''

  if loader.isGraph component
    if typeof component is 'object'
      if typeof component.toJSON is 'function'
        callback null,
          name: nameParts[1]
          library: nameParts[0]
          code: JSON.stringify component.toJSON()
          language: 'json'
        return
      callback new Error "Can't provide source for #{name}. Not a file"
      return
    fbpGraph.graph.loadFile component, (err, graph) ->
      if err
        callback err
        return
      return callback new Error 'Unable to load graph' unless graph
      callback null,
        name: nameParts[1]
        library: nameParts[0]
        code: JSON.stringify graph.toJSON()
        language: 'json'
    return

  if typeof component isnt 'string'
    callback new Error "Can't provide source for #{name}. Not a file"
    return

  fs.readFile component, 'utf-8', (err, code) ->
    if err
      callback err
      return
    callback null,
      name: nameParts[1]
      library: nameParts[0]
      language: utils.guessLanguageFromFilename component
      code: code
    return
  return
