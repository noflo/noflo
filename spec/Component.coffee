if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  chai = require 'chai' unless chai
  component = require '../src/lib/Component.coffee'
  socket = require '../src/lib/InternalSocket.coffee'
else
  component = require 'noflo/src/lib/Component.js'
  socket = require 'noflo/src/lib/InternalSocket.js'

describe 'Component', ->
  describe 'with required ports', ->
    it 'should throw an error upon sending packet to an unattached required port', ->
      s2 = new socket.InternalSocket
      c = new component.Component
        outPorts:
          requiredPort:
            required: true
          optionalPort: {}
      c.outPorts.optionalPort.attach s2
      chai.expect(-> c.outPorts.requiredPorts.send('foo')).to.throw()

    it 'should be cool with an attached port', ->
      s1 = new socket.InternalSocket
      s2 = new socket.InternalSocket
      c = new component.Component
        inPorts:
          requiredPort:
            required: true
          optionalPort: {}
      c.inPorts.requiredPort.attach s1
      c.inPorts.optionalPort.attach s2
      f = ->
        s2.send 'some-data'
      chai.expect(f).to.not.throw()

  describe 'with component creation shorthand', ->
    it 'should make component creation easy', (done) ->
      c = new component.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
            process: (event, packet, component) ->
              return unless event is 'data'
              chai.expect(packet).to.equal 'some-data'
              chai.expect(component).to.equal c

          justProcessor: (event, packet, component) ->
            return unless event is 'data'
            chai.expect(packet).to.equal 'some-data'
            chai.expect(component).to.equal c
            done()

      s1 = new socket.InternalSocket
      c.inPorts.in.attach s1
      c.inPorts.in.nodeInstance = c
      s2 = new socket.InternalSocket
      c.inPorts.justProcessor.attach s1
      c.inPorts.justProcessor.nodeInstance = c
      s1.send 'some-data'
      s2.send 'some-data'

    it 'should throw errors if there is no error port', (done) ->
      c = new component.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
            process: (event, packet, component) ->
              return unless event is 'data'
              chai.expect(packet).to.equal 'some-data'
              chai.expect(component).to.equal c
              chai.expect(-> c.error(new Error)).to.throw Error
              done()

      s1 = new socket.InternalSocket
      c.inPorts.in.attach s1
      c.inPorts.in.nodeInstance = c
      s1.send 'some-data'

    it 'should throw errors if there is a non-attached error port', (done) ->
      c = new component.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
            process: (event, packet, component) ->
              return unless event is 'data'
              chai.expect(packet).to.equal 'some-data'
              chai.expect(component).to.equal c
              chai.expect(-> c.error(new Error)).to.throw Error
              done()
        outPorts:
          error:
            datatype: 'object'

      s1 = new socket.InternalSocket
      c.inPorts.in.attach s1
      c.inPorts.in.nodeInstance = c
      s1.send 'some-data'

    it 'should not throw errors if there is a non-required error port', (done) ->
      c = new component.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
            process: (event, packet, component) ->
              return unless event is 'data'
              chai.expect(packet).to.equal 'some-data'
              chai.expect(component).to.equal c
              c.error new Error
              done()
        outPorts:
          error:
            required: no

      s1 = new socket.InternalSocket
      c.inPorts.in.attach s1
      c.inPorts.in.nodeInstance = c
      s1.send 'some-data'

    it 'should send errors if there is a connected error port', (done) ->
      grps = []
      c = new component.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
            process: (event, packet, component) ->
              grps.push packet if event is 'begingroup'
              return unless event is 'data'
              chai.expect(packet).to.equal 'some-data'
              chai.expect(component).to.equal c
              c.error new Error, grps
        outPorts:
          error:
            datatype: 'object'

      s1 = new socket.InternalSocket
      s2 = new socket.InternalSocket
      groups = [
        'foo'
        'bar'
      ]
      s2.on 'begingroup', (grp) ->
        chai.expect(grp).to.equal groups.shift()
      s2.on 'data', (err) ->
        chai.expect(err).to.be.an.instanceOf Error
        chai.expect(groups.length).to.equal 0
        done()

      c.inPorts.in.attach s1
      c.outPorts.error.attach s2
      c.inPorts.in.nodeInstance = c
      s1.beginGroup 'foo'
      s1.beginGroup 'bar'
      s1.send 'some-data'
