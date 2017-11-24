#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2016-2017 Flowhub UG
#     NoFlo may be freely distributed under the MIT license

# ## Information Packets
#
# IP objects are the way information is transmitted between
# components running in a NoFlo network. IP objects contain
# a `type` that defines whether they're regular `data` IPs
# or whether they are the beginning or end of a stream
# (`openBracket`, `closeBracket`).
#
# The component currently holding an IP object is identified
# with the `owner` key.
#
# By default, IP objects may be sent to multiple components.
# If they're set to be clonable, each component will receive
# its own clone of the IP. This should be enabled for any
# IP object working with data that is safe to clone.
#
# It is also possible to carry metadata with an IP object.
# For example, the `datatype` and `schema` of the sending
# port is transmitted with the IP object.
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
    @scope = null # sync scope id
    @owner = null # packet owner process
    @clonable = false # cloning safety flag
    @index = null # addressable port index
    @schema = null
    @datatype = 'all'
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
