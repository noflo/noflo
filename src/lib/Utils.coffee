#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014 TheGrid (Rituwall Inc.)
#     NoFlo may be freely distributed under the MIT license
#
# Generic object clone. From CS cookbook
clone = (obj) ->
  if not obj? or typeof obj isnt 'object'
    return obj

  if obj instanceof Date
    return new Date(obj.getTime())

  if obj instanceof RegExp
    flags = ''
    flags += 'g' if obj.global?
    flags += 'i' if obj.ignoreCase?
    flags += 'm' if obj.multiline?
    flags += 'y' if obj.sticky?
    return new RegExp(obj.source, flags)

  newInstance = new obj.constructor()

  for key of obj
    newInstance[key] = clone obj[key]

  return newInstance

# Guess language from filename
guessLanguageFromFilename = (filename) ->
  return 'coffeescript' if /.*\.coffee$/.test filename
  return 'javascript'

isArray = (obj) ->
  return Array.isArray(obj) if Array.isArray
  return Object.prototype.toString.call(arg) == '[object Array]'

# from http://underscorejs.org/docs/underscore.html

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

isObject = (obj) ->
  type = typeof(obj)
  type == 'function' or type == 'object' and ! !obj

getKeys = (obj) ->
  if !isObject obj
    return []
  if Object.keys
    return Object.keys(obj)
  keys = []
  for key of obj
    if obj.has key
      keys.push key
  keys

getValues = (obj) ->
  keys = getKeys obj
  length = keys.length
  values = Array(length)
  i = 0
  while i < length
    values[i] = obj[keys[i]]
    i++
  values

contains = (obj, item, fromIndex) ->
  if !isArray obj
    obj = getValues obj
  if typeof fromIndex != 'number' or guard
    fromIndex = 0
  obj.indexOf(item) >= 0

intersection = (array) ->
  result = []
  argsLength = arguments.length
  for i in [0..array.length]
    item = array[i]
    continue if contains result, item

    for j in [1..argsLength]
      break if !contains arguments[j], item

    result.push item if j is argsLength
  result

unique = (array) ->
  output = {}
  output[array[key]] = array[key] for key in [0...array.length]
  value for key, value of output

exports.clone = clone
exports.guessLanguageFromFilename = guessLanguageFromFilename
exports.optimizeCb = optimizeCb
exports.reduceRight = reduceRight
exports.debounce = debounce
exports.unique = unique
exports.intersection = intersection
exports.getValues = getValues
