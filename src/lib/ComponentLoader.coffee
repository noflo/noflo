#     NoFlo - Flow-Based Programming for Node.js
#     (c) 2013 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# This is the browser version of the ComponentLoader.

class ComponentLoader
  constructor: (@baseDir) ->
    @components = null
    @checked = []
    @revalidate = false
  
  getModulePrefix: (name) ->
    return '' unless name
    name.replace 'noflo-', ''

  listComponents: (callback) ->
    return callback @components unless @components is null

    # Interim solution for loading registered components
    # until component/builder.js#62 is fixed
    @components = {}
    registration = require "#{@baseDir}components.js"
    registration.register @

    callback @components

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

  isGraph: (cPath) -> false

  registerComponent: (packageId, name, cPath, callback) ->
    prefix = @getModulePrefix packageId
    fullName = "#{prefix}/#{name}"
    fullName = name unless packageId
    @components[fullName] = cPath
    do callback if callback

  registerGraph: (packageId, name, gPath, callback) ->
    @registerComponent packageId, name, gPath, callback

  clear: ->
    @components = null
    @checked = []
    @revalidate = true

exports.ComponentLoader = ComponentLoader
