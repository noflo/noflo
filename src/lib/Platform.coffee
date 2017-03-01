#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014-2017 Flowhub UG
#     NoFlo may be freely distributed under the MIT license
#
# Platform detection method
exports.isBrowser = ->
  if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
    return false
  true

# Mechanism for showing API deprecation warnings. By default logs the warnings
# but can also be configured to throw instead with the `NOFLO_FATAL_DEPRECATED`
# env var.
exports.deprecated = (message) ->
  if exports.isBrowser()
    throw new Error message if window.NOFLO_FATAL_DEPRECATED
    console.warn message
    return
  if process.env.NOFLO_FATAL_DEPRECATED
    throw new Error message
  console.warn message
