#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014-2015 TheGrid (Rituwall Inc.)
#     NoFlo may be freely distributed under the MIT license
#
# Platform detection method
exports.isBrowser = ->
  if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
    return false
  true

exports.deprecated = (message) ->
  if exports.isBrowser()
    throw new Error message if window.NOFLO_FATAL_DEPRECATED
    console.warn message
    return
  if process.env.NOFLO_FATAL_DEPRECATED
    throw new Error message
  console.warn message
