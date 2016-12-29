exports.validate = (strict, datatype, data) ->
  if strict is true and datatype isnt 'all'
    switch typeof datatype
      when 'object'
        if typeof data isnt 'object'
          return false
      when 'array'
        if !Array.isArray(data)
          return false
      when 'number', 'int'
        if typeof data isnt 'number' and not Number.isNaN(data)
          return false
      when 'string', 'function'
        if typeof data isnt datatype
          return false
      when 'boolean'
        if String(data) isnt 'true' and String(data) isnt 'false'
          return false
      when 'date'
        if isNaN(Date.parse('foo')) is false
          return false
      when 'buffer'
        if not Buffer.isBuffer buffer
          return false
      when 'stream'
        if not data instanceof EventEmitter
          return false
  return true

exports.validTypes = [
  'all'
  'string'
  'number'
  'int'
  'object'
  'array'
  'boolean'
  'color'
  'date'
  'bang'
  'function'
  'buffer'
  'stream'
]
