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

      s1.post new IP 'data', 'some-data',
        groups: ['foo']

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

  describe 'with process function', ->
    c = null
    sin1 = null
    sin2 = null
    sin3 = null
    sout1 = null
    sout2 = null

    beforeEach (done) ->
      sin1 = new socket.InternalSocket
      sin2 = new socket.InternalSocket
      sin3 = new socket.InternalSocket
      sout1 = new socket.InternalSocket
      sout2 = new socket.InternalSocket
      done()

    it 'should trigger on IPs', (done) ->
      hadIPs = []
      c = new component.Component
        inPorts:
          foo: datatype: 'string'
          bar: datatype: 'string'
        outPorts:
          baz: datatype: 'boolean'
        process: (input, output) ->
          hadIPs = []
          hadIPs.push 'foo' if input.has 'foo'
          hadIPs.push 'bar' if input.has 'bar'
          output.sendDone baz: true

      c.inPorts.foo.attach sin1
      c.inPorts.bar.attach sin2
      c.outPorts.baz.attach sout1

      count = 0
      sout1.on 'data', (ip) ->
        count++
        if count is 1
          chai.expect(hadIPs).to.eql ['foo']
        if count is 2
          chai.expect(hadIPs).to.eql ['foo', 'bar']
          done()

      sin1.post new IP 'data', 'first'
      sin2.post new IP 'data', 'second'

    it 'should not be triggered by non-triggering ports', (done) ->
      triggered = []
      c = new component.Component
        inPorts:
          foo:
            datatype: 'string'
            triggering: false
          bar: datatype: 'string'
        outPorts:
          baz: datatype: 'boolean'
        process: (input, output) ->
          triggered.push input.port.name
          output.sendDone baz: true

      c.inPorts.foo.attach sin1
      c.inPorts.bar.attach sin2
      c.outPorts.baz.attach sout1

      count = 0
      sout1.on 'data', (ip) ->
        count++
        if count is 1
          chai.expect(triggered).to.eql ['bar']
        if count is 2
          chai.expect(triggered).to.eql ['bar', 'bar']
          done()

      sin1.post new IP 'data', 'first'
      sin2.post new IP 'data', 'second'
      sin1.post new IP 'data', 'first'
      sin2.post new IP 'data', 'second'

    it 'should receive and send complete IP objects', (done) ->
      c = new component.Component
        inPorts:
          foo: datatype: 'string'
          bar: datatype: 'string'
        outPorts:
          baz: datatype: 'object'
        process: (input, output) ->
          return unless input.has 'foo', 'bar'
          [foo, bar] = input.get 'foo', 'bar'
          baz =
            foo: foo.data
            bar: bar.data
            groups: foo.groups
            type: bar.type
          output.sendDone
            baz: new IP 'data', baz,
              groups: ['baz']

      c.inPorts.foo.attach sin1
      c.inPorts.bar.attach sin2
      c.outPorts.baz.attach sout1

      sout1.once 'data', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.data.foo).to.equal 'foo'
        chai.expect(ip.data.bar).to.equal 'bar'
        chai.expect(ip.data.groups).to.eql ['foo']
        chai.expect(ip.data.type).to.equal 'data'
        chai.expect(ip.groups).to.eql ['baz']
        done()

      sin1.post new IP 'data', 'foo',
        groups: ['foo']
      sin2.post new IP 'data', 'bar',
        groups: ['bar']

    it 'should receive and send just IP data if wanted', (done) ->
      c = new component.Component
        inPorts:
          foo: datatype: 'string'
          bar: datatype: 'string'
        outPorts:
          baz: datatype: 'object'
        process: (input, output) ->
          return unless input.has 'foo', 'bar'
          [foo, bar] = input.getData 'foo', 'bar'
          baz =
            foo: foo
            bar: bar
          output.sendDone
            baz: baz

      c.inPorts.foo.attach sin1
      c.inPorts.bar.attach sin2
      c.outPorts.baz.attach sout1

      sout1.once 'data', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.data.foo).to.equal 'foo'
        chai.expect(ip.data.bar).to.equal 'bar'
        done()

      sin1.post new IP 'data', 'foo',
        groups: ['foo']
      sin2.post new IP 'data', 'bar',
        groups: ['bar']

    it 'should keep last value for controls', (done) ->
      c = new component.Component
        inPorts:
          foo: datatype: 'string'
          bar:
            datatype: 'string'
            control: true
        outPorts:
          baz: datatype: 'object'
        process: (input, output) ->
          return unless input.has 'foo', 'bar'
          [foo, bar] = input.getData 'foo', 'bar'
          baz =
            foo: foo
            bar: bar
          output.sendDone
            baz: baz

      c.inPorts.foo.attach sin1
      c.inPorts.bar.attach sin2
      c.outPorts.baz.attach sout1

      sout1.once 'data', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.data.foo).to.equal 'foo'
        chai.expect(ip.data.bar).to.equal 'bar'
        sout1.once 'data', (ip) ->
          chai.expect(ip).to.be.an 'object'
          chai.expect(ip.type).to.equal 'data'
          chai.expect(ip.data.foo).to.equal 'boo'
          chai.expect(ip.data.bar).to.equal 'bar'
          done()

      sin1.post new IP 'data', 'foo'
      sin2.post new IP 'data', 'bar'
      sin1.post new IP 'data', 'boo'

    it 'should isolate packets with different scopes', (done) ->
      foo1 = 'Josh'
      bar1 = 'Laura'
      bar2 = 'Luke'
      foo2 = 'Jane'

      c = new component.Component
        inPorts:
          foo: datatype: 'string'
          bar: datatype: 'string'
        outPorts:
          baz: datatype: 'string'
        process: (input, output) ->
          return unless input.has 'foo', 'bar'
          [foo, bar] = input.getData 'foo', 'bar'
          output.sendDone
            baz: "#{foo} and #{bar}"

      c.inPorts.foo.attach sin1
      c.inPorts.bar.attach sin2
      c.outPorts.baz.attach sout1

      sout1.once 'data', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.scope).to.equal '1'
        chai.expect(ip.data).to.equal 'Josh and Laura'
        sout1.once 'data', (ip) ->
          chai.expect(ip).to.be.an 'object'
          chai.expect(ip.type).to.equal 'data'
          chai.expect(ip.scope).to.equal '2'
          chai.expect(ip.data).to.equal 'Jane and Luke'
          done()

      sin1.post new IP 'data', 'Josh', scope: '1'
      sin2.post new IP 'data', 'Luke', scope: '2'
      sin2.post new IP 'data', 'Laura', scope: '1'
      sin1.post new IP 'data', 'Jane', scope: '2'

    it 'should be able to change scope', (done) ->
      c = new component.Component
        inPorts:
          foo: datatype: 'string'
        outPorts:
          baz: datatype: 'string'
        process: (input, output) ->
          foo = input.getData 'foo'
          output.sendDone
            baz: new IP 'data', foo, scope: 'baz'

      c.inPorts.foo.attach sin1
      c.outPorts.baz.attach sout1

      sout1.once 'data', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.scope).to.equal 'baz'
        chai.expect(ip.data).to.equal 'foo'
        done()

      sin1.post new IP 'data', 'foo', scope: 'foo'

    it 'should preserve order between input and output', (done) ->
      c = new component.Component
        inPorts:
          msg: datatype: 'string'
          delay: datatype: 'int'
        outPorts:
          out: datatype: 'object'
        ordered: true
        process: (input, output) ->
          return unless input.has 'msg', 'delay'
          [msg, delay] = input.getData 'msg', 'delay'
          setTimeout ->
            output.sendDone
              out: { msg: msg, delay: delay }
          , delay

      c.inPorts.msg.attach sin1
      c.inPorts.delay.attach sin2
      c.outPorts.out.attach sout1

      sample = [
        { delay: 30, msg: "one" }
        { delay: 0, msg: "two" }
        { delay: 20, msg: "three" }
        { delay: 10, msg: "four" }
      ]

      sout1.on 'data', (ip) ->
        chai.expect(ip.data).to.eql sample.shift()
        done() if sample.length is 0

      for ip in sample
        sin1.post new IP 'data', ip.msg
        sin2.post new IP 'data', ip.delay

    it 'should ignore order between input and output', (done) ->
      c = new component.Component
        inPorts:
          msg: datatype: 'string'
          delay: datatype: 'int'
        outPorts:
          out: datatype: 'object'
        ordered: false
        process: (input, output) ->
          return unless input.has 'msg', 'delay'
          [msg, delay] = input.getData 'msg', 'delay'
          setTimeout ->
            output.sendDone
              out: { msg: msg, delay: delay }
          , delay

      c.inPorts.msg.attach sin1
      c.inPorts.delay.attach sin2
      c.outPorts.out.attach sout1

      sample = [
        { delay: 30, msg: "one" }
        { delay: 0, msg: "two" }
        { delay: 20, msg: "three" }
        { delay: 10, msg: "four" }
      ]

      count = 0
      sout1.on 'data', (ip) ->
        count++
        switch count
          when 1 then src = sample[1]
          when 2 then src = sample[3]
          when 3 then src = sample[2]
          when 4 then src = sample[0]
        chai.expect(ip.data).to.eql src
        done() if count is 4

      for ip in sample
        sin1.post new IP 'data', ip.msg
        sin2.post new IP 'data', ip.delay

    describe 'with custom callbacks', ->
      c = null
      sin1 = null
      sin2 = null
      sin3 = null
      sout1 = null
      sout2 = null

      beforeEach (done) ->
        c = new component.Component
          inPorts:
            foo: datatype: 'string'
            bar:
              datatype: 'int'
              control: true
          outPorts:
            baz: datatype: 'object'
            err: datatype: 'object'
          ordered: true
          activateOnInput: false
          process: (input, output, done) ->
            return unless input.has 'foo', 'bar'
            [foo, bar] = input.getData 'foo', 'bar'
            if bar < 0 or bar > 1000
              return output.sendDone
                err: new Error "Bar is not correct: #{bar}"
            # Start capturing output
            input.activate()
            output.send
              baz: new IP 'openBracket'
            baz =
              foo: foo
              bar: bar
            output.send
              baz: baz
            setTimeout ->
              output.send
                baz: new IP 'closeBracket'
              done()
            , bar
        sin1 = new socket.InternalSocket
        sin2 = new socket.InternalSocket
        sin3 = new socket.InternalSocket
        sout1 = new socket.InternalSocket
        sout2 = new socket.InternalSocket
        c.inPorts.foo.attach sin1
        c.inPorts.bar.attach sin2
        c.outPorts.baz.attach sout1
        c.outPorts.err.attach sout2
        done()

      it 'should fail on wrong input', (done) ->
        sout1.once 'data', (ip) ->
          done new Error 'Unexpected baz'
        sout2.once 'data', (ip) ->
          chai.expect(ip).to.be.an 'object'
          chai.expect(ip.data).to.be.an.error
          chai.expect(ip.data.message).to.contain 'Bar'
          done()

        sin1.post new IP 'data', 'fff'
        sin2.post new IP 'data', -120

      it 'should send substreams', (done) ->
        sample = [
          { bar: 30, foo: "one" }
          { bar: 0, foo: "two" }
        ]
        expected = [
          '<'
          'one'
          '>'
          '<'
          'two'
          '>'
        ]
        actual = []
        count = 0
        sout1.on 'data', (ip) ->
          count++
          switch ip.type
            when 'openBracket'
              actual.push '<'
            when 'closeBracket'
              actual.push '>'
            else
              actual.push ip.data.foo
          if count is 6
            chai.expect(actual).to.eql expected
            done()
        sout2.once 'data', (ip) ->
          done ip.data

        for item in sample
          sin2.post new IP 'data', item.bar
          sin1.post new IP 'data', item.foo
