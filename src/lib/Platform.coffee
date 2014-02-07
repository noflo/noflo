#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014 The Grid
#     NoFlo may be freely distributed under the MIT license
#
# Platform detection method
exports.isBrowser = ->
  if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
    return false
  true
