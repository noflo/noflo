#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014-2017 Flowhub UG
#     NoFlo may be freely distributed under the MIT license

# Guess language from filename
guessLanguageFromFilename = (filename) ->
  return 'coffeescript' if /.*\.coffee$/.test filename
  return 'javascript'

isArray = (obj) ->
  return Array.isArray(obj) if Array.isArray
  return Object.prototype.toString.call(arg) == '[object Array]'

# the following functions are from http://underscorejs.org/docs/underscore.html
# Underscore.js 1.8.3 http://underscorejs.org
# (c) 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
# Underscore may be freely distributed under the MIT license.

# Internal function that returns an efficient (for current engines)
# version of the passed-in callback,
# to be repeatedly applied in other Underscore functions.
optimizeCb = (func, context, argCount) ->
  if context == undefined
    return func
  switch (if argCount == null then 3 else argCount)
    when 1
      return (value) ->
        func.call context, value
    when 2
      return (value, other) ->
        func.call context, value, other
    when 3
      return (value, index, collection) ->
        func.call context, value, index, collection
    when 4
      return (accumulator, value, index, collection) ->
        func.call context, accumulator, value, index, collection
  ->
    func.apply context, arguments


# Create a reducing function iterating left or right.
# Optimized iterator function as using arguments.length in the main function
# will deoptimize the, see #1991.
createReduce = (dir) ->
  iterator = (obj, iteratee, memo, keys, index, length) ->
    while index >= 0 and index < length
      currentKey = if keys then keys[index] else index
      memo = iteratee(memo, obj[currentKey], currentKey, obj)
      index += dir
    memo

  return (obj, iteratee, memo, context) ->
    iteratee = optimizeCb(iteratee, context, 4)
    keys = Object.keys obj
    length = (keys or obj).length
    index = if dir > 0 then 0 else length - 1
    if arguments.length < 3
      memo = obj[if keys then keys[index] else index]
      index += dir
    iterator obj, iteratee, memo, keys, index, length

reduceRight = createReduce(-1)

# Returns a function, that, as long as it continues to be invoked,
# will not be triggered.
# The function will be called after it stops being called for N milliseconds.
# If immediate is passed, trigger the function on the leading edge,
# instead of the trailing.
debounce = (func, wait, immediate) ->
  timeout = undefined
  args = undefined
  context = undefined
  timestamp = undefined
  result = undefined

  later = ->
    last = Date.now - timestamp
    if last < wait and last >= 0
      timeout = setTimeout(later, wait - last)
    else
      timeout = null
      if !immediate
        result = func.apply(context, args)
        if !timeout
          context = args = null
    return

  ->
    context = this
    args = arguments
    timestamp = Date.now
    callNow = immediate and !timeout
    if !timeout
      timeout = setTimeout(later, wait)
    if callNow
      result = func.apply(context, args)
      context = args = null
    result

exports.guessLanguageFromFilename = guessLanguageFromFilename
exports.reduceRight = reduceRight
exports.debounce = debounce
exports.isArray = isArray
