reader = require 'read-installed'
{_} = require 'underscore'
path = require 'path'
fs = require 'fs'

# We allow components to be un-compiled CoffeeScript
require 'coffee-script'

# Disable NPM logging in normal NoFlo operation
log = require 'npmlog'
log.pause()

class ComponentLoader
  components = null
  checked = []

  constructor: (@baseDir) ->

  getModulePrefix: (name) ->
    name.replace 'noflo-', ''

  getModuleComponents: (moduleDef) ->
    components = {}
    checked.push moduleDef.name

    prefix = @getModulePrefix moduleDef.name

    # Handle sub-modules
    _.each moduleDef.dependencies, (def) =>
      return unless checked.indexOf(def.name) is -1
      depComponents = @getModuleComponents def
      return if _.isEmpty depComponents
      _.each depComponents, (cPath, name) ->
        components[name] = cPath

    # Handle own components
    return components unless moduleDef.noflo
    return components unless moduleDef.noflo.components
    _.each moduleDef.noflo.components, (cPath, name) ->
      components["#{prefix}/#{name}"] = path.resolve moduleDef.realPath, cPath
    components

  listComponents: (callback) ->
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

  load: (name, callback) ->
    unless @components
      @listComponents (components) =>
        @load name, callback
      return
    
    unless @components[name]
      throw new Error "Component #{name} not available"
      return

    implementation = require @components[name]
    callback implementation.getComponent()

exports.ComponentLoader = ComponentLoader
