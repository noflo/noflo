#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2020 Flowhub UG
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license

module.exports = class ProcessContext
  constructor: (@ip, @nodeInstance, @port, @result) ->
    @scope = @ip.scope
    @activated = false
    @deactivated = false
  activate: ->
    # Push a new result value if previous has been sent already
    if @result.__resolved or @nodeInstance.outputQ.indexOf(@result) is -1
      @result = {}
    @nodeInstance.activate @
    return
  deactivate: ->
    @result.__resolved = true unless @result.__resolved
    @nodeInstance.deactivate @
    return
