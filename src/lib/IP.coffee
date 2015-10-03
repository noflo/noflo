module.exports = class IP
  # Creates as new IP object
  # Valid types: 'data', 'openBracket', 'closeBracket'
  constructor: (@type = 'data', @data = null) ->
    @groups = [] # sync groups
    @scope = null # sync scope id
    @stream = null # substream id
    @owner = null # packet owner process

  # Creates a new IP copying its contents by value not reference
  clone: ->
    ip = new IP
    ip.type = @type
    ip.data = JSON.parse JSON.stringify @data if @data isnt null
    ip.groups = JSON.parse JSON.stringify @groups if @groups.length > 0
    ip.scope = @scope # sync scope is preserved
    ip

  # Moves an IP to a different owner
  move: (@owner) ->
    # no-op

  # Frees IP contents
  drop: ->
    delete @type
    delete @data
    delete @groups
    delete @scope
    delete @stream
    delete @owner
