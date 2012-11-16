reader = require 'read-installed'
{_} = require 'underscore'
path = require 'path'
fs = require 'fs'
internalSocket = require './InternalSocket'

# We allow components to be un-compiled CoffeeScript
require 'coffee-script'

# Disable NPM logging in normal NoFlo operation
log = require 'npmlog'
log.pause()

class ComponentLoader
  constructor: (@baseDir) ->
    @components = null
    @checked = []

  getModulePrefix: (name) ->
    return '' unless name
    name.replace 'noflo-', ''

  getModuleComponents: (moduleDef) ->
    components = {}
    @checked.push moduleDef.name

    prefix = @getModulePrefix moduleDef.name

    # Handle sub-modules
    _.each moduleDef.dependencies, (def) =>
      return unless @checked.indexOf(def.name) is -1
      depComponents = @getModuleComponents def
      return if _.isEmpty depComponents
      _.each depComponents, (cPath, name) ->
        components[name] = cPath

    # Handle own components
    return components unless moduleDef.noflo
    if moduleDef.noflo.components
      _.each moduleDef.noflo.components, (cPath, name) ->
        components["#{prefix}/#{name}"] = path.resolve moduleDef.realPath, cPath
    if moduleDef.noflo.graphs
      _.each moduleDef.noflo.graphs, (gPath, name) ->
        components["#{prefix}/#{name}"] = path.resolve moduleDef.realPath, gPath
    components

  listComponents: (callback) ->
    return callback @components unless @components is null

    # Read core components
    # TODO: These components should eventually be migrated to modules too
    corePath = path.resolve __dirname, '../src/components'
    fs.readdir corePath, (err, components) =>
      coreComponents = {}
      _.each components, (component) ->
        return if component.substr(0, 1) is '.'
        [componentName, componentExtension] = component.split '.'
        return unless componentExtension is 'coffee'
        coreComponents[componentName] = "#{corePath}/#{component}"
      reader @baseDir, (err, data) =>
        return callback err, data if err
        @components = _.extend coreComponents, @getModuleComponents data
        callback @components

  isGraph: (path) ->
    path.indexOf('.fbp') isnt -1 or path.indexOf('.json') isnt -1

  load: (name, callback) ->
    unless @components
      @listComponents (components) =>
        @load name, callback
      return
    
    unless @components[name]
      throw new Error "Component #{name} not available"
      return

    if @isGraph @components[name]
      process.nextTick =>
        @loadGraph name, callback
      return

    implementation = require @components[name]
    callback implementation.getComponent()

  loadGraph: (name, callback) ->
    graphImplementation = require @components['Graph']
    graphSocket = internalSocket.createSocket()
    graph = graphImplementation.getComponent()
    graph.inPorts.graph.attach graphSocket
    graphSocket.send @components[name]
    graphSocket.disconnect()
    delete graph.inPorts.graph
    callback graph

exports.ComponentLoader = ComponentLoader
