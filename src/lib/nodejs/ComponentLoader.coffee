#     NoFlo - Flow-Based Programming for Node.js
#     (c) 2013 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# This is the Node.js version of the ComponentLoader.

reader = require 'read-installed'
{_} = require 'underscore'
path = require 'path'
fs = require 'fs'
loader = require '../ComponentLoader'
internalSocket = require '../InternalSocket'

# We allow components to be un-compiled CoffeeScript
require 'coffee-script'

# Disable NPM logging in normal NoFlo operation
log = require 'npmlog'
log.pause()

class ComponentLoader extends loader.ComponentLoader
  getModuleComponents: (moduleDef, callback) ->
    components = {}
    @checked.push moduleDef.name

    depCount = _.keys(moduleDef.dependencies).length
    done = _.after depCount + 1, =>
      callback components

    # Handle sub-modules
    _.each moduleDef.dependencies, (def) =>
      return done() unless @checked.indexOf(def.name) is -1
      @getModuleComponents def, (depComponents) ->
        return done() if _.isEmpty depComponents
        components[name] = cPath for name, cPath of depComponents
        done()

    # No need for further processing for non-NoFlo projects
    return done() unless moduleDef.noflo

    checkOwn = (def) =>
      # Handle own components
      prefix = @getModulePrefix def.name

      if def.noflo.components
        for name, cPath of def.noflo.components
          components["#{prefix}/#{name}"] = path.resolve def.realPath, cPath
      if moduleDef.noflo.graphs
        for name, gPath of def.noflo.graphs
          components["#{prefix}/#{name}"] = path.resolve def.realPath, gPath
      done()

    # Normally we can rely on the module data we get from read-installed, but in
    # case cache has been cleared, we must re-read the file
    unless @revalidate
      return checkOwn moduleDef
    @readPackageFile "#{moduleDef.realPath}/package.json", (err, data) ->
      return done() if err
      checkOwn data

  getCoreComponents: (callback) ->
    # Read core components
    # TODO: These components should eventually be migrated to modules too
    corePath = path.resolve __dirname, '../../src/components'
    if path.extname(__filename) is '.coffee'
      # Handle the non-compiled version of ComponentLoader for unit tests
      corePath = path.resolve __dirname, '../../components'

    fs.readdir corePath, (err, components) =>
      coreComponents = {}
      return callback coreComponents if err
      for component in components
        continue if component.substr(0, 1) is '.'
        [componentName, componentExtension] = component.split '.'
        continue unless componentExtension is 'coffee'
        coreComponents[componentName] = "#{corePath}/#{component}"
      callback coreComponents

  listComponents: (callback) ->
    return callback @components unless @components is null

    @components = {}
    done = _.after 2, =>
      callback @components

    @getCoreComponents (coreComponents) =>
      @components[name] = cPath for name, cPath of coreComponents
      done()

    reader @baseDir, (err, data) =>
      return done() if err
      @getModuleComponents data, (components) =>
        @components[name] = cPath for name, cPath of components
        done()

  isGraph: (cPath) ->
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

  getPackagePath: (packageId, callback) ->
    found = null
    seen = []
    find = (packageData) ->
      return if seen.indexOf(packageData.name) isnt -1
      seen.push packageData.name
      if packageData.name is packageId
        found = "#{packageData.realPath}/package.json"
        return
      _.each packageData.dependencies, find
    reader @baseDir, (err, data) ->
      return callback err if err
      find data
      return callback null, found

  readPackage: (packageId, callback) ->
    @getPackagePath packageId, (err, packageFile) =>
      return callback err if err
      return callback new Error 'no package found' unless packageFile
      @readPackageFile packageFile, callback

  readPackageFile: (packageFile, callback) ->
    fs.readFile packageFile, 'utf-8', (err, packageData) ->
      return callback err if err
      data = JSON.parse packageData
      data.realPath = path.dirname packageFile
      callback null, data

  writePackage: (packageId, data, callback) ->
    @getPackagePath packageId, (err, packageFile) ->
      return callback err if err
      return callback new Error 'no package found' unless packageFile
      delete data.realPath if data.realPath
      packageData = JSON.stringify data, null, 2
      fs.writeFile packageFile, packageData, callback

  registerComponent: (packageId, name, cPath, callback = ->) ->
    @readPackage packageId, (err, packageData) =>
      return callback err if err
      packageData.noflo = {} unless packageData.noflo
      packageData.noflo.components = {} unless packageData.noflo.components
      packageData.noflo.components[name] = cPath
      @clear()
      @writePackage packageId, packageData, callback

  registerGraph: (packageId, name, cPath, callback = ->) ->
    @readPackage packageId, (err, packageData) =>
      return callback err if err
      packageData.noflo = {} unless packageData.noflo
      packageData.noflo.graphs = {} unless packageData.noflo.graphs
      packageData.noflo.graphs[name] = cPath
      @clear()
      @writePackage packageId, packageData, callback

exports.ComponentLoader = ComponentLoader
