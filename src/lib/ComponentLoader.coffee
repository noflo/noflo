reader = require 'read-installed'
{_} = require 'underscore'
path = require 'path'

class ComponentLoader
  @components = null

  constructor: (@baseDir) ->

  getModuleComponents: (moduleDef) ->
    components = {}

    # Handle sub-modules
    _.each moduleDef.dependencies, (def) =>
      _.extend components, @getModuleComponents def

    # Handle own components
    return components unless moduleDef.noflo
    return components unless moduleDef.noflo.components
    _.each moduleDef.noflo.components, (cPath, name) ->
      components[name] = path.resolve moduleDef.realPath, cPath
    components

  listComponents: (callback) ->
    reader @baseDir, (err, data) =>
      return callback err, data if err
      @components = @getModuleComponents data
      callback @components

  load: (name, callback) ->
    if @components is null
      @listComponents (components) =>
        @load name, callback
      return
    
    unless @components[name]
      throw new Error "Component #{name} not available"
      return

    implementation = require @components[name]
    callback implementation.getComponent()

exports.ComponentLoader = ComponentLoader
