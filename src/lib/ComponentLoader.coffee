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
    return '' if name is 'noflo'
    name.replace 'noflo-', ''

  getModuleComponents: (moduleName) ->
    return unless @checked.indexOf(moduleName) is -1
    @checked.push moduleName
    try
      definition = require "/#{moduleName}/component.json"
    catch e
      return

    for dependency of definition.dependencies
      @getModuleComponents dependency.replace '/', '-'

    return unless definition.noflo

    prefix = @getModulePrefix definition.name
    if definition.noflo.components
      for name, cPath of definition.noflo.components
        @registerComponent prefix, name, "/#{moduleName}/#{cPath}"

  listComponents: (callback) ->
    return callback @components unless @components is null

    @components = {}

    @getModuleComponents @baseDir

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
    instance = implementation.getComponent()
    instance.baseDir = @baseDir if name is 'Graph'
    callback instance

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
