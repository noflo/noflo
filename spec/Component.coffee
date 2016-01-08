if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  component = require '../src/lib/Component.coffee'
  socket = require '../src/lib/InternalSocket.coffee'
  IP = require '../src/lib/IP.coffee'
else
  component = require 'noflo/src/lib/Component.js'
  socket = require 'noflo/src/lib/InternalSocket.js'
  IP = require 'noflo/src/lib/IP.js'

describe 'Component', ->
  describe 'with required ports', ->
    it 'should throw an error upon sending packet to an unattached required port', ->
      s2 = new socket.InternalSocket
      c = new component.Component
        outPorts:
          required_port:
            required: true
          optional_port: {}
      c.outPorts.optional_port.attach s2
      chai.expect(-> c.outPorts.required_port.send('foo')).to.throw()

    it 'should be cool with an attached port', ->
      s1 = new socket.InternalSocket
      s2 = new socket.InternalSocket
      c = new component.Component
        inPorts:
          required_port:
            required: true
          optional_port: {}
      c.inPorts.required_port.attach s1
      c.inPorts.optional_port.attach s2
      f = ->
        s1.send 'some-more-data'
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

          just_processor: (event, packet, component) ->
            return unless event is 'data'
            chai.expect(packet).to.equal 'some-data'
            chai.expect(component).to.equal c
            done()

      s1 = new socket.InternalSocket
      c.inPorts.in.attach s1
      c.inPorts.in.nodeInstance = c
      s2 = new socket.InternalSocket
      c.inPorts.just_processor.attach s1
      c.inPorts.just_processor.nodeInstance = c
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
            required: true

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

  describe 'defining ports with invalid names', ->
    it 'should throw an error with uppercase letters in inport', ->
      shorthand = ->
        c = new component.Component
          inPorts:
            fooPort: {}
      chai.expect(shorthand).to.throw()
    it 'should throw an error with uppercase letters in outport', ->
      shorthand = ->
        c = new component.Component
          outPorts:
            BarPort: {}
      chai.expect(shorthand).to.throw()
    it 'should throw an error with special characters in inport', ->
      shorthand = ->
        c = new component.Component
          inPorts:
            '$%^&*a': {}
      chai.expect(shorthand).to.throw()

  describe 'starting a component', ->

    it 'should flag the component as started', ->
      c = new component.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
      i = new socket.InternalSocket
      c.inPorts.in.attach(i)
      c.start()
      chai.expect(c.started).to.equal(true)
      chai.expect(c.isStarted()).to.equal(true)

  describe 'shutting down a component', ->

    it 'should flag the component as not started', ->
      c = new component.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
      i = new socket.InternalSocket
      c.inPorts.in.attach(i)
      c.start()
      c.shutdown()
      chai.expect(c.started).to.equal(false)
      chai.expect(c.isStarted()).to.equal(false)

  describe 'with object-based IPs', ->

    it 'should speak IP objects', (done) ->
      c = new component.Component
        inPorts:
          in:
            datatype: 'string'
            handle: (ip, component) ->
              chai.expect(ip).to.be.an 'object'
              chai.expect(ip.type).to.equal 'data'
              chai.expect(ip.groups).to.be.an 'array'
              chai.expect(ip.groups).to.eql ['foo']
              chai.expect(ip.data).to.be.a 'string'
              chai.expect(ip.data).to.equal 'some-data'

              c.outPorts.out.data 'bar',
                groups: ['foo']
        outPorts:
          out:
            datatype: 'string'

      s1 = new socket.InternalSocket
      s2 = new socket.InternalSocket

      s2.on 'data', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.groups).to.be.an 'array'
        chai.expect(ip.groups).to.eql ['foo']
        chai.expect(ip.data).to.be.a 'string'
        chai.expect(ip.data).to.equal 'bar'
        done()

      c.inPorts.in.attach s1
      c.outPorts.out.attach s2

      i = new IP 'data', 'some-data'
      i.groups = ['foo']
      s1.post i

    it 'should support substreams', (done) ->
      c = new component.Component
        inPorts:
          tags:
            datatype: 'string'
            handle: (ip) ->
              chai.expect(ip).to.be.an 'object'
              switch ip.type
                when 'openBracket'
                  c.str += "<#{ip.data}>"
                  c.level++
                when 'data'
                  c.str += ip.data
                when 'closeBracket'
                  c.str += "</#{ip.data}>"
                  c.level--
                  if c.level is 0
                    c.outPorts.html.data c.str
                    c.str = ''
        outPorts:
          html:
            datatype: 'string'
      c.str = ''
      c.level = 0

      d = new component.Component
        inPorts:
          bang:
            datatype: 'bang'
            handle: (ip) ->
              d.outPorts.tags.openBracket 'p'
              .openBracket 'em'
              .data 'Hello'
              .closeBracket 'em'
              .data ', '
              .openBracket 'strong'
              .data 'World!'
              .closeBracket 'strong'
              .closeBracket 'p'
        outPorts:
          tags:
            datatype: 'string'

      s1 = new socket.InternalSocket
      s2 = new socket.InternalSocket
      s3 = new socket.InternalSocket

      s3.on 'data', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.data).to.equal '<p><em>Hello</em>, <strong>World!</strong></p>'
        done()

      d.inPorts.bang.attach s1
      d.outPorts.tags.attach s2
      c.inPorts.tags.attach s2
      c.outPorts.html.attach s3

      s1.post new IP 'data', 'start'
