#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2016 TheGrid (Rituwall Inc.)
#     NoFlo may be freely distributed under the MIT license
module.exports = class IP
  # Valid IP types
  @types: [
    'data'
    'openBracket'
    'closeBracket'
  ]

  # Detects if an arbitrary value is an IP
  @isIP: (obj) ->
    obj and typeof obj is 'object' and obj._isIP is true

  # Creates as new IP object
  # Valid types: 'data', 'openBracket', 'closeBracket'
  constructor: (@type = 'data', @data = null, options = {}) ->
    @_isIP = true
    @groups = [] # sync groups
    @scope = null # sync scope id
    @owner = null # packet owner process
    @clonable = false # cloning safety flag
    @index = null # addressable port index
    for key, val of options
      this[key] = val

  # Creates a new IP copying its contents by value not reference
  clone: ->
    ip = new IP @type
    for key, val of @
      continue if ['owner'].indexOf(key) isnt -1
      continue if val is null
      if typeof(val) is 'object'
        ip[key] = JSON.parse JSON.stringify val
      else
        ip[key] = val
    ip

  # Moves an IP to a different owner
  move: (@owner) ->
    # no-op

  # Frees IP contents
  drop: ->
    delete this[key] for key, val of @
