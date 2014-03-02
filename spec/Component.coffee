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
  describe 'with required ports', ->
    it 'should throw an error upon receiving packet with an unattached required port', ->
      s1 = new socket
      s2 = new socket
      c = new component
        inPorts:
          requiredPort: new port
            required: true
          optionalPort: new port
      c.inPorts.optionalPort.attach s2
      run = ->
        s2.send 'some-data'
      chai.expect(run).to.throw()

    it 'should be cool with an attached port', ->
      s1 = new socket
      s2 = new socket
      c = new component
        inPorts:
          requiredPort: new port
            required: true
          optionalPort: new port
      c.inPorts.requiredPort.attach s1
      c.inPorts.optionalPort.attach s2
      f = ->
        s2.send 'some-data'
      chai.expect(f).to.not.throw()

    it 'should simply forward error if error port is attached', (done) ->
      s1 = new socket
      s2 = new socket
      s3 = new socket
      c = new component
        inPorts:
          requiredPort: new port
            required: true
          optionalPort: new port
        outPorts:
          error: new.port
      c.inPorts.optionalPort.attach s2
      c.outPorts.error.attach s3
      s3.on 'connect', ->
        chai.assert true
        done()
      f = ->
        s2.send 'some-data'
      chai.expect(f).to.not.throw()
