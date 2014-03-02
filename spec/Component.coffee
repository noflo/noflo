if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  chai = require 'chai' unless chai
  component = require '../src/lib/Component.coffee'
  port = require '../src/lib/Port.coffee'
  socket = require '../src/lib/InternalSocket.coffee'
else
  component = require 'noflo/src/lib/Component.js'
  port = require 'noflo/src/lib/Port.js'
  socket = require 'noflo/src/lib/InternalSocket.js'

describe 'Component', ->
  describe 'with required ports', (done) ->
    it 'should throw an error upon receiving packet with an unattached required port', (done) ->
      s1 = new socket
      s2 = new socket
      c = new component
        inPorts:
          requiredPort: new inport
            required: true
          optionalPort: new inport
      c.inPorts.optionalPort.attach s2
      run = ->
        s2.send 'some-data'
      chai.expect(run).to.throw()

    it 'should be cool with an attached port', (done) ->
      s1 = new socket
      s2 = new socket
      c = new component
        inPorts:
          requiredPort: new inport
            required: true
          optionalPort: new inport
      c.inPorts.requiredPort.attach s1
      c.inPorts.optionalPort.attach s2
      run = ->
        s2.send 'some-data'
      chai.expect(run).to.not.throw()
