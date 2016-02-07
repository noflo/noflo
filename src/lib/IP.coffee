module.exports = class IP
  @types: [
    'data'
    'openBracket'
    'closeBracket'
  ]

  # Creates as new IP object
  # Valid types: 'data', 'openBracket', 'closeBracket'
  constructor: (@type = 'data', @data = null, options = {}) ->
    @groups = [] # sync groups
    @scope = null # sync scope id
    @owner = null # packet owner process
    @clonable = true # cloning safety flag
    for key, val of options
      this[key] = val

  # Creates a new IP copying its contents by value not reference
  clone: ->
    return @ unless @clonable
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
