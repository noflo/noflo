utils = require '../Utils'
nofloGraph = require '../Graph'
platform = require '../Platform'

customLoader =
  checked: []

  getModuleDependencies: (loader, dependencies, callback) ->
    unless dependencies?.length
      return callback null

    dependency = dependencies.shift()
    dependency = dependency.replace '/', '-'
    @getModuleComponents loader, dependency, (err) =>
      @getModuleDependencies loader, dependencies, callback

  getModuleComponents: (loader, moduleName, callback) ->
    return callback() unless @checked.indexOf(moduleName) is -1
    @checked.push moduleName
    try
      definition = require "/#{moduleName}/component.json"
    catch e
      if moduleName.substr(0, 1) is '/' and moduleName.length > 1
        return @getModuleComponents loader, "noflo-#{moduleName.substr(1)}", callback
      return callback e

    return callback() unless definition.noflo
    return callback() unless definition.dependencies

    @getModuleDependencies loader, Object.keys(definition.dependencies), (err) ->
      return callback err if err

      prefix = loader.getModulePrefix definition.name

      if definition.noflo.icon
        loader.setLibraryIcon prefix, definition.noflo.icon

      if moduleName[0] is '/'
        moduleName = moduleName.substr 1

      if definition.noflo.components
        for name, cPath of definition.noflo.components
          if cPath.indexOf('.coffee') isnt -1
            cPath = cPath.replace '.coffee', '.js'
          if cPath.substr(0, 2) is './'
            cPath = cPath.substr 2
          loader.registerComponent prefix, name, "/#{moduleName}/#{cPath}"
      if definition.noflo.graphs
        for name, cPath of definition.noflo.graphs
          def = require "/#{moduleName}/#{cPath}"
          loader.registerGraph prefix, name, def

      if definition.noflo.loader
        # Run a custom component loader
        loaderPath = "/#{moduleName}/#{definition.noflo.loader}"
        customLoader = require loaderPath
        loader.registerLoader customLoader, callback
        return

      do callback

exports.register = (loader, callback) ->
  platform.deprecated 'Component.io is deprecated. Please make browser builds using webpack instead. grunt-noflo-browser provides a simple setup for this'

  customLoader.checked = []
  # Start discovery from baseDir
  setTimeout ->
    customLoader.getModuleComponents loader, loader.baseDir, callback
  , 1

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
  if language is 'coffeescript'
    unless window.CoffeeScript
      return callback new Error 'CoffeeScript compiler not available'
    try
      source = CoffeeScript.compile source,
        bare: true
    catch e
      return callback e
  else if language in ['es6', 'es2015']
    unless window.babel
      return callback new Error 'Babel compiler not available'
    try
      source = babel.transform(source).code
    catch e
      return callback e

  # We eval the contents to get a runnable component
  try
    # Modify require path for NoFlo since we're inside the NoFlo context
    source = source.replace "require('noflo')", "require('../NoFlo')"
    source = source.replace 'require("noflo")', 'require("../NoFlo")'

    # Eval so we can get a function
    implementation = eval "(function () { var exports = {}; #{source}; return exports; })()"
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

  path = window.require.resolve component
  unless path
    return callback new Error "Component #{name} is not resolvable to a path"
  callback null,
    name: nameParts[1]
    library: nameParts[0]
    code: window.require.modules[path].toString()
    language: utils.guessLanguageFromFilename component
