if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  component = require '../../src/lib/Component.coffee'
  socket = require '../../src/lib/InternalSocket.coffee'
  IP = require '../../src/lib/IP.coffee'
else
  component = require 'noflo/src/lib/Component.js'
  socket = require 'noflo/src/lib/InternalSocket.js'
  IP = require 'noflo/src/lib/IP.js'

exports.getComponent = ->
  c = new component.Component
    desciption: 'Merges two objects into one (cloning)'
    inPorts:
      obj1:
        datatype: 'object'
        desciption: 'First object'
      obj2:
        datatype: 'object'
        desciption: 'Second object'
      overwrite:
        datatype: 'boolean'
        desciption: 'Overwrite obj1 properties with obj2'
        control: true
    outPorts:
      result:
        datatype: 'object'
      error:
        datatype: 'object'

  c.process (input, output) ->
    return unless input.has 'obj1', 'obj2', 'overwrite'
    [obj1, obj2, overwrite] = input.getData 'obj1', 'obj2', 'overwrite'
    try
      src = JSON.parse JSON.stringify if overwrite then obj1 else obj2
      dst = JSON.parse JSON.stringify if overwrite then obj2 else obj1
    catch e
      return output.done e
    for key, val of dst
      src[key] = val
    output.sendDone
      result: src
