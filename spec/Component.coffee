if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo.coffee'
else
  noflo = require 'noflo'

describe 'Component', ->
  describe 'with required ports', ->
    it 'should throw an error upon sending packet to an unattached required port', ->
      s2 = new noflo.internalSocket.InternalSocket
      c = new noflo.Component
        outPorts:
          required_port:
            required: true
          optional_port: {}
      c.outPorts.optional_port.attach s2
      chai.expect(-> c.outPorts.required_port.send('foo')).to.throw()

    it 'should be cool with an attached port', ->
      s1 = new noflo.internalSocket.InternalSocket
      s2 = new noflo.internalSocket.InternalSocket
      c = new noflo.Component
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
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
          just_processor: {}
        process: (input, output) ->
          if input.hasData 'in'
            packet = input.getData 'in'
            chai.expect(packet).to.equal 'some-data'
            output.done()
            return
          if input.hasData 'just_processor'
            packet = input.getData 'just_processor'
            chai.expect(packet).to.equal 'some-data'
            output.done()
            done()
            return

      s1 = new noflo.internalSocket.InternalSocket
      c.inPorts.in.attach s1
      c.inPorts.in.nodeInstance = c
      s2 = new noflo.internalSocket.InternalSocket
      c.inPorts.just_processor.attach s1
      c.inPorts.just_processor.nodeInstance = c
      s1.send 'some-data'
      s2.send 'some-data'

    it 'should throw errors if there is no error port', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
        process: (input, output) ->
          packet = input.getData 'in'
          chai.expect(packet).to.equal 'some-data'
          chai.expect(-> output.error(new Error)).to.throw Error
          done()

      s1 = new noflo.internalSocket.InternalSocket
      c.inPorts.in.attach s1
      c.inPorts.in.nodeInstance = c
      s1.send 'some-data'

    it 'should throw errors if there is a non-attached error port', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
        outPorts:
          error:
            datatype: 'object'
            required: true
        process: (input, output) ->
          packet = input.getData 'in'
          chai.expect(packet).to.equal 'some-data'
          chai.expect(-> output.error(new Error)).to.throw Error
          done()

      s1 = new noflo.internalSocket.InternalSocket
      c.inPorts.in.attach s1
      c.inPorts.in.nodeInstance = c
      s1.send 'some-data'

    it 'should not throw errors if there is a non-required error port', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
        outPorts:
          error:
            required: no
        process: (input, output) ->
          packet = input.getData 'in'
          chai.expect(packet).to.equal 'some-data'
          c.error new Error
          done()

      s1 = new noflo.internalSocket.InternalSocket
      c.inPorts.in.attach s1
      c.inPorts.in.nodeInstance = c
      s1.send 'some-data'

    it 'should send errors if there is a connected error port', (done) ->
      grps = []
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
        outPorts:
          error:
            datatype: 'object'
        process: (input, output) ->
          return unless input.hasData 'in'
          packet = input.getData 'in'
          chai.expect(packet).to.equal 'some-data'
          output.done new Error()

      s1 = new noflo.internalSocket.InternalSocket
      s2 = new noflo.internalSocket.InternalSocket
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
        c = new noflo.Component
          inPorts:
            fooPort: {}
      chai.expect(shorthand).to.throw()
    it 'should throw an error with uppercase letters in outport', ->
      shorthand = ->
        c = new noflo.Component
          outPorts:
            BarPort: {}
      chai.expect(shorthand).to.throw()
    it 'should throw an error with special characters in inport', ->
      shorthand = ->
        c = new noflo.Component
          inPorts:
            '$%^&*a': {}
      chai.expect(shorthand).to.throw()
  describe 'with non-existing ports', ->
    getComponent = ->
      c = new noflo.Component
        inPorts:
          in: {}
        outPorts:
          out: {}
    getAddressableComponent = ->
      c = new noflo.Component
        inPorts:
          in:
            addressable: true
        outPorts:
          out:
            addressable: true
    it 'should throw an error when checking attached for non-existing port', (done) ->
      c = getComponent()
      c.process (input, output) ->
        try
          input.attached 'foo'
        catch e
          chai.expect(e).to.be.an 'Error'
          chai.expect(e.message).to.contain 'foo'
          done()
          return
        done new Error 'Expected a throw'
      sin1 = noflo.internalSocket.createSocket()
      c.inPorts.in.attach sin1
      sin1.send 'hello'
    it 'should throw an error when checking IP for non-existing port', (done) ->
      c = getComponent()
      c.process (input, output) ->
        try
          input.has 'foo'
        catch e
          chai.expect(e).to.be.an 'Error'
          chai.expect(e.message).to.contain 'foo'
          done()
          return
        done new Error 'Expected a throw'
      sin1 = noflo.internalSocket.createSocket()
      c.inPorts.in.attach sin1
      sin1.send 'hello'
    it 'should throw an error when checking IP for non-existing addressable port', (done) ->
      c = getComponent()
      c.process (input, output) ->
        try
          input.has ['foo', 0]
        catch e
          chai.expect(e).to.be.an 'Error'
          chai.expect(e.message).to.contain 'foo'
          done()
          return
        done new Error 'Expected a throw'
      sin1 = noflo.internalSocket.createSocket()
      c.inPorts.in.attach sin1
      sin1.send 'hello'
    it 'should throw an error when checking data for non-existing port', (done) ->
      c = getComponent()
      c.process (input, output) ->
        try
          input.hasData 'foo'
        catch e
          chai.expect(e).to.be.an 'Error'
          chai.expect(e.message).to.contain 'foo'
          done()
          return
        done new Error 'Expected a throw'
      sin1 = noflo.internalSocket.createSocket()
      c.inPorts.in.attach sin1
      sin1.send 'hello'
    it 'should throw an error when checking stream for non-existing port', (done) ->
      c = getComponent()
      c.process (input, output) ->
        try
          input.hasStream 'foo'
        catch e
          chai.expect(e).to.be.an 'Error'
          chai.expect(e.message).to.contain 'foo'
          done()
          return
        done new Error 'Expected a throw'
      sin1 = noflo.internalSocket.createSocket()
      c.inPorts.in.attach sin1
      sin1.send 'hello'

  describe 'starting a component', ->

    it 'should flag the component as started', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
      i = new noflo.internalSocket.InternalSocket
      c.inPorts.in.attach(i)
      c.start (err) ->
        return done err if err
        chai.expect(c.started).to.equal(true)
        chai.expect(c.isStarted()).to.equal(true)
        done()

  describe 'shutting down a component', ->

    it 'should flag the component as not started', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
      i = new noflo.internalSocket.InternalSocket
      c.inPorts.in.attach(i)
      c.start (err) ->
        return done err if err
        chai.expect(c.isStarted()).to.equal(true)
        c.shutdown (err) ->
          return done err if err
          chai.expect(c.started).to.equal(false)
          chai.expect(c.isStarted()).to.equal(false)
          done()

  describe 'with object-based IPs', ->

    it 'should speak IP objects', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
        outPorts:
          out:
            datatype: 'string'
        process: (input, output) ->
          output.sendDone input.get 'in'

      s1 = new noflo.internalSocket.InternalSocket
      s2 = new noflo.internalSocket.InternalSocket

      s2.on 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.groups).to.be.an 'array'
        chai.expect(ip.groups).to.eql ['foo']
        chai.expect(ip.data).to.be.a 'string'
        chai.expect(ip.data).to.equal 'some-data'
        done()

      c.inPorts.in.attach s1
      c.outPorts.out.attach s2

      s1.post new noflo.IP 'data', 'some-data',
        groups: ['foo']

    it 'should support substreams', (done) ->
      c = new noflo.Component
        forwardBrackets: {}
        inPorts:
          tags:
            datatype: 'string'
        outPorts:
          html:
            datatype: 'string'
        process: (input, output) ->
          ip = input.get 'tags'
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
                output.send html: c.str
                c.str = ''
          output.done()
      c.str = ''
      c.level = 0

      d = new noflo.Component
        inPorts:
          bang:
            datatype: 'bang'
        outPorts:
          tags:
            datatype: 'string'
        process: (input, output) ->
          input.getData 'bang'
          output.send tags: new noflo.IP 'openBracket', 'p'
          output.send tags: new noflo.IP 'openBracket', 'em'
          output.send tags: new noflo.IP 'data', 'Hello'
          output.send tags: new noflo.IP 'closeBracket', 'em'
          output.send tags: new noflo.IP 'data', ', '
          output.send tags: new noflo.IP 'openBracket', 'strong'
          output.send tags: new noflo.IP 'data', 'World!'
          output.send tags: new noflo.IP 'closeBracket', 'strong'
          output.send tags: new noflo.IP 'closeBracket', 'p'
          outout.done()

      s1 = new noflo.internalSocket.InternalSocket
      s2 = new noflo.internalSocket.InternalSocket
      s3 = new noflo.internalSocket.InternalSocket

      s3.on 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.data).to.equal '<p><em>Hello</em>, <strong>World!</strong></p>'
        done()

      d.inPorts.bang.attach s1
      d.outPorts.tags.attach s2
      c.inPorts.tags.attach s2
      c.outPorts.html.attach s3

      s1.post new noflo.IP 'data', 'start'

  describe 'with process function', ->
    c = null
    sin1 = null
    sin2 = null
    sin3 = null
    sout1 = null
    sout2 = null

    beforeEach (done) ->
      sin1 = new noflo.internalSocket.InternalSocket
      sin2 = new noflo.internalSocket.InternalSocket
      sin3 = new noflo.internalSocket.InternalSocket
      sout1 = new noflo.internalSocket.InternalSocket
      sout2 = new noflo.internalSocket.InternalSocket
      done()

    it 'should trigger on IPs', (done) ->
      hadIPs = []
      c = new noflo.Component
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
      sout1.on 'ip', (ip) ->
        count++
        if count is 1
          chai.expect(hadIPs).to.eql ['foo']
        if count is 2
          chai.expect(hadIPs).to.eql ['foo', 'bar']
          done()

      sin1.post new noflo.IP 'data', 'first'
      sin2.post new noflo.IP 'data', 'second'

    it 'should trigger on IPs to addressable ports', (done) ->
      receivedIndexes = []
      c = new noflo.Component
        inPorts:
          foo:
            datatype: 'string'
            addressable: true
        outPorts:
          baz:
            datatype: 'boolean'
        process: (input, output) ->
          # See what inbound connection indexes have data
          indexesWithData = input.attached('foo').filter (idx) ->
            input.hasData ['foo', idx]
          return unless indexesWithData.length
          # Read from the first of them
          indexToUse = indexesWithData[0]
          packet = input.get ['foo', indexToUse]
          receivedIndexes.push
            idx: indexToUse
            payload: packet.data
          output.sendDone baz: true

      c.inPorts.foo.attach sin1, 1
      c.inPorts.foo.attach sin2, 0
      c.outPorts.baz.attach sout1

      count = 0
      sout1.on 'ip', (ip) ->
        count++
        if count is 1
          chai.expect(receivedIndexes).to.eql [
            idx: 1
            payload: 'first'
          ]
        if count is 2
          chai.expect(receivedIndexes).to.eql [
            idx: 1
            payload: 'first'
          ,
            idx: 0
            payload: 'second'
          ]
          done()
      sin1.post new noflo.IP 'data', 'first'
      sin2.post new noflo.IP 'data', 'second'

    it 'should be able to send IPs to addressable connections', (done) ->
      expected = [
        data: 'first'
        index: 1
      ,
        data: 'second'
        index: 0
      ]
      c = new noflo.Component
        inPorts:
          foo:
            datatype: 'string'
        outPorts:
          baz:
            datatype: 'boolean'
            addressable: true
        process: (input, output) ->
          return unless input.has 'foo'
          packet = input.get 'foo'
          output.sendDone new noflo.IP 'data', packet.data,
            index: expected.length - 1

      c.inPorts.foo.attach sin1
      c.outPorts.baz.attach sout1, 1
      c.outPorts.baz.attach sout2, 0

      sout1.on 'ip', (ip) ->
        exp = expected.shift()
        received =
          data: ip.data
          index: 1
        chai.expect(received).to.eql exp
        done() unless expected.length
      sout2.on 'ip', (ip) ->
        exp = expected.shift()
        received =
          data: ip.data
          index: 0
        chai.expect(received).to.eql exp
        done() unless expected.length
      sin1.post new noflo.IP 'data', 'first'
      sin1.post new noflo.IP 'data', 'second'

    it 'trying to send to addressable port without providing index should fail', (done) ->
      c = new noflo.Component
        inPorts:
          foo:
            datatype: 'string'
        outPorts:
          baz:
            datatype: 'boolean'
            addressable: true
        process: (input, output) ->
          return unless input.hasData 'foo'
          packet = input.get 'foo'
          noIndex = new noflo.IP 'data', packet.data
          chai.expect(-> output.sendDone noIndex).to.throw Error
          done()

      c.inPorts.foo.attach sin1
      c.outPorts.baz.attach sout1, 1
      c.outPorts.baz.attach sout2, 0

      sout1.on 'ip', (ip) ->
      sout2.on 'ip', (ip) ->

      sin1.post new noflo.IP 'data', 'first'

    it 'should be able to send falsy IPs', (done) ->
      expected = [
        port: 'out1'
        data: 1
      ,
        port: 'out2'
        data: 0
      ]
      c = new noflo.Component
        inPorts:
          foo:
            datatype: 'string'
        outPorts:
          out1:
            datatype: 'int'
          out2:
            datatype: 'int'
        process: (input, output) ->
          return unless input.has 'foo'
          packet = input.get 'foo'
          output.sendDone
            out1: 1
            out2: 0

      c.inPorts.foo.attach sin1
      c.outPorts.out1.attach sout1, 1
      c.outPorts.out2.attach sout2, 0

      sout1.on 'ip', (ip) ->
        exp = expected.shift()
        received =
          port: 'out1'
          data: ip.data
        chai.expect(received).to.eql exp
        done() unless expected.length
      sout2.on 'ip', (ip) ->
        exp = expected.shift()
        received =
          port: 'out2'
          data: ip.data
        chai.expect(received).to.eql exp
        done() unless expected.length
      sin1.post new noflo.IP 'data', 'first'

    it 'should not be triggered by non-triggering ports', (done) ->
      triggered = []
      c = new noflo.Component
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
      sout1.on 'ip', (ip) ->
        count++
        if count is 1
          chai.expect(triggered).to.eql ['bar']
        if count is 2
          chai.expect(triggered).to.eql ['bar', 'bar']
          done()

      sin1.post new noflo.IP 'data', 'first'
      sin2.post new noflo.IP 'data', 'second'
      sin1.post new noflo.IP 'data', 'first'
      sin2.post new noflo.IP 'data', 'second'

    it 'should fetch undefined for premature data', (done) ->
      c = new noflo.Component
        inPorts:
          foo:
            datatype: 'string'
          bar:
            datatype: 'boolean'
            triggering: false
            control: true
          baz:
            datatype: 'string'
            triggering: false
            control: true
        process: (input, output) ->
          return unless input.has 'foo'
          [foo, bar, baz] = input.getData 'foo', 'bar', 'baz'
          chai.expect(foo).to.be.a 'string'
          chai.expect(bar).to.be.undefined
          chai.expect(baz).to.be.undefined
          done()

      c.inPorts.foo.attach sin1
      c.inPorts.bar.attach sin2
      c.inPorts.baz.attach sin3

      sin1.post new noflo.IP 'data', 'AZ'
      sin2.post new noflo.IP 'data', true
      sin3.post new noflo.IP 'data', 'first'

    it 'should receive and send complete noflo.IP objects', (done) ->
      c = new noflo.Component
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
            baz: new noflo.IP 'data', baz,
              groups: ['baz']

      c.inPorts.foo.attach sin1
      c.inPorts.bar.attach sin2
      c.outPorts.baz.attach sout1

      sout1.once 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.data.foo).to.equal 'foo'
        chai.expect(ip.data.bar).to.equal 'bar'
        chai.expect(ip.data.groups).to.eql ['foo']
        chai.expect(ip.data.type).to.equal 'data'
        chai.expect(ip.groups).to.eql ['baz']
        done()

      sin1.post new noflo.IP 'data', 'foo',
        groups: ['foo']
      sin2.post new noflo.IP 'data', 'bar',
        groups: ['bar']

    it 'should stamp IP objects with the datatype of the outport when sending', (done) ->
      c = new noflo.Component
        inPorts:
          foo: datatype: 'all'
        outPorts:
          baz: datatype: 'string'
        process: (input, output) ->
          return unless input.has 'foo'
          foo = input.get 'foo'
          output.sendDone
            baz: foo

      c.inPorts.foo.attach sin1
      c.outPorts.baz.attach sout1

      sout1.once 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.data).to.equal 'foo'
        chai.expect(ip.datatype).to.equal 'string'
        done()

      sin1.post new noflo.IP 'data', 'foo'
    it 'should stamp IP objects with the datatype of the inport when receiving', (done) ->
      c = new noflo.Component
        inPorts:
          foo: datatype: 'string'
        outPorts:
          baz: datatype: 'all'
        process: (input, output) ->
          return unless input.has 'foo'
          foo = input.get 'foo'
          output.sendDone
            baz: foo

      c.inPorts.foo.attach sin1
      c.outPorts.baz.attach sout1

      sout1.once 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.data).to.equal 'foo'
        chai.expect(ip.datatype).to.equal 'string'
        done()

      sin1.post new noflo.IP 'data', 'foo'
    it 'should stamp IP objects with the schema of the outport when sending', (done) ->
      c = new noflo.Component
        inPorts:
          foo: datatype: 'all'
        outPorts:
          baz:
            datatype: 'string'
            schema: 'text/markdown'
        process: (input, output) ->
          return unless input.has 'foo'
          foo = input.get 'foo'
          output.sendDone
            baz: foo

      c.inPorts.foo.attach sin1
      c.outPorts.baz.attach sout1

      sout1.once 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.data).to.equal 'foo'
        chai.expect(ip.datatype).to.equal 'string'
        chai.expect(ip.schema).to.equal 'text/markdown'
        done()

      sin1.post new noflo.IP 'data', 'foo'
    it 'should stamp IP objects with the schema of the inport when receiving', (done) ->
      c = new noflo.Component
        inPorts:
          foo:
            datatype: 'string'
            schema: 'text/markdown'
        outPorts:
          baz: datatype: 'all'
        process: (input, output) ->
          return unless input.has 'foo'
          foo = input.get 'foo'
          output.sendDone
            baz: foo

      c.inPorts.foo.attach sin1
      c.outPorts.baz.attach sout1

      sout1.once 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.data).to.equal 'foo'
        chai.expect(ip.datatype).to.equal 'string'
        chai.expect(ip.schema).to.equal 'text/markdown'
        done()

      sin1.post new noflo.IP 'data', 'foo'

    it 'should receive and send just IP data if wanted', (done) ->
      c = new noflo.Component
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

      sout1.once 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.data.foo).to.equal 'foo'
        chai.expect(ip.data.bar).to.equal 'bar'
        done()

      sin1.post new noflo.IP 'data', 'foo',
        groups: ['foo']
      sin2.post new noflo.IP 'data', 'bar',
        groups: ['bar']

    it 'should receive IPs and be able to selectively find them', (done) ->
      called = 0
      c = new noflo.Component
        inPorts:
          foo: datatype: 'string'
          bar: datatype: 'string'
        outPorts:
          baz: datatype: 'object'
        process: (input, output) ->
          validate = (ip) ->
            called++
            ip.type is 'data' and ip.data is 'hello'
          unless input.has 'foo', 'bar', validate
            return
          foo = input.get 'foo'
          while foo?.type isnt 'data'
            foo = input.get 'foo'
          bar = input.getData 'bar'
          output.sendDone
            baz: "#{foo.data}:#{bar}"

      c.inPorts.foo.attach sin1
      c.inPorts.bar.attach sin2
      c.outPorts.baz.attach sout1

      shouldHaveSent = false

      sout1.on 'ip', (ip) ->
        chai.expect(shouldHaveSent, 'Should not sent before its time').to.equal true
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.data).to.equal 'hello:hello'
        chai.expect(called).to.equal 10
        done()

      sin1.post new noflo.IP 'openBracket', 'a'
      sin1.post new noflo.IP 'data', 'hello',
      sin1.post new noflo.IP 'closeBracket', 'a'
      shouldHaveSent = true
      sin2.post new noflo.IP 'data', 'hello'

    it 'should keep last value for controls', (done) ->
      c = new noflo.Component
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

      sout1.once 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.data.foo).to.equal 'foo'
        chai.expect(ip.data.bar).to.equal 'bar'
        sout1.once 'ip', (ip) ->
          chai.expect(ip).to.be.an 'object'
          chai.expect(ip.type).to.equal 'data'
          chai.expect(ip.data.foo).to.equal 'boo'
          chai.expect(ip.data.bar).to.equal 'bar'
          done()

      sin1.post new noflo.IP 'data', 'foo'
      sin2.post new noflo.IP 'data', 'bar'
      sin1.post new noflo.IP 'data', 'boo'

    it 'should keep last data-typed IP packet for controls', (done) ->
      c = new noflo.Component
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

      sout1.once 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.data.foo).to.equal 'foo'
        chai.expect(ip.data.bar).to.equal 'bar'
        sout1.once 'ip', (ip) ->
          chai.expect(ip).to.be.an 'object'
          chai.expect(ip.type).to.equal 'data'
          chai.expect(ip.data.foo).to.equal 'boo'
          chai.expect(ip.data.bar).to.equal 'bar'
          done()

      sin1.post new noflo.IP 'data', 'foo'
      sin2.post new noflo.IP 'openBracket'
      sin2.post new noflo.IP 'data', 'bar'
      sin2.post new noflo.IP 'closeBracket'
      sin1.post new noflo.IP 'data', 'boo'

    it 'should isolate packets with different scopes', (done) ->
      c = new noflo.Component
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

      sout1.once 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.scope).to.equal '1'
        chai.expect(ip.data).to.equal 'Josh and Laura'
        sout1.once 'ip', (ip) ->
          chai.expect(ip).to.be.an 'object'
          chai.expect(ip.type).to.equal 'data'
          chai.expect(ip.scope).to.equal '2'
          chai.expect(ip.data).to.equal 'Jane and Luke'
          done()

      sin1.post new noflo.IP 'data', 'Josh', scope: '1'
      sin2.post new noflo.IP 'data', 'Luke', scope: '2'
      sin2.post new noflo.IP 'data', 'Laura', scope: '1'
      sin1.post new noflo.IP 'data', 'Jane', scope: '2'

    it 'should be able to change scope', (done) ->
      c = new noflo.Component
        inPorts:
          foo: datatype: 'string'
        outPorts:
          baz: datatype: 'string'
        process: (input, output) ->
          foo = input.getData 'foo'
          output.sendDone
            baz: new noflo.IP 'data', foo, scope: 'baz'

      c.inPorts.foo.attach sin1
      c.outPorts.baz.attach sout1

      sout1.once 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.scope).to.equal 'baz'
        chai.expect(ip.data).to.equal 'foo'
        done()

      sin1.post new noflo.IP 'data', 'foo', scope: 'foo'

    it 'should support integer scopes', (done) ->
      c = new noflo.Component
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

      sout1.once 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.scope).to.equal 1
        chai.expect(ip.data).to.equal 'Josh and Laura'
        sout1.once 'ip', (ip) ->
          chai.expect(ip).to.be.an 'object'
          chai.expect(ip.type).to.equal 'data'
          chai.expect(ip.scope).to.equal 0
          chai.expect(ip.data).to.equal 'Jane and Luke'
          sout1.once 'ip', (ip) ->
            chai.expect(ip).to.be.an 'object'
            chai.expect(ip.type).to.equal 'data'
            chai.expect(ip.scope).to.be.null
            chai.expect(ip.data).to.equal 'Tom and Anna'
            done()

      sin1.post new noflo.IP 'data', 'Tom'
      sin1.post new noflo.IP 'data', 'Josh', scope: 1
      sin2.post new noflo.IP 'data', 'Luke', scope: 0
      sin2.post new noflo.IP 'data', 'Laura', scope: 1
      sin1.post new noflo.IP 'data', 'Jane', scope: 0
      sin2.post new noflo.IP 'data', 'Anna'

    it 'should preserve order between input and output', (done) ->
      c = new noflo.Component
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

      sout1.on 'ip', (ip) ->
        chai.expect(ip.data).to.eql sample.shift()
        done() if sample.length is 0

      for ip in sample
        sin1.post new noflo.IP 'data', ip.msg
        sin2.post new noflo.IP 'data', ip.delay

    it 'should ignore order between input and output', (done) ->
      c = new noflo.Component
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
      sout1.on 'ip', (ip) ->
        count++
        switch count
          when 1 then src = sample[1]
          when 2 then src = sample[3]
          when 3 then src = sample[2]
          when 4 then src = sample[0]
        chai.expect(ip.data).to.eql src
        done() if count is 4

      for ip in sample
        sin1.post new noflo.IP 'data', ip.msg
        sin2.post new noflo.IP 'data', ip.delay

    it 'should throw errors if there is no error port', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
        process: (input, output) ->
          packet = input.get 'in'
          chai.expect(packet.data).to.equal 'some-data'
          chai.expect(-> output.done new Error 'Should fail').to.throw Error
          done()

      c.inPorts.in.attach sin1
      sin1.post new noflo.IP 'data', 'some-data'

    it 'should throw errors if there is a non-attached error port', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
        outPorts:
          error:
            datatype: 'object'
            required: true
        process: (input, output) ->
          packet = input.get 'in'
          chai.expect(packet.data).to.equal 'some-data'
          chai.expect(-> output.sendDone new Error 'Should fail').to.throw Error
          done()

      c.inPorts.in.attach sin1
      sin1.post new noflo.IP 'data', 'some-data'

    it 'should not throw errors if there is a non-required error port', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
        outPorts:
          error:
            required: no
        process: (input, output) ->
          packet = input.get 'in'
          chai.expect(packet.data).to.equal 'some-data'
          output.sendDone new Error 'Should not fail'
          done()

      c.inPorts.in.attach sin1
      sin1.post new noflo.IP 'data', 'some-data'

    it 'should send out string other port if there is only one port aside from error', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'all'
            required: true
        outPorts:
          out:
            required: true
          error:
            required: false
        process: (input, output) ->
          packet = input.get 'in'
          output.sendDone 'some data'

      sout1.on 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.data).to.equal 'some data'
        done()

      c.inPorts.in.attach sin1
      c.outPorts.out.attach sout1

      sin1.post new noflo.IP 'data', 'first'

    it 'should send object out other port if there is only one port aside from error', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'all'
            required: true
        outPorts:
          out:
            required: true
          error:
            required: false
        process: (input, output) ->
          packet = input.get 'in'
          output.sendDone some: 'data'

      sout1.on 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.data).to.eql some: 'data'
        done()

      c.inPorts.in.attach sin1
      c.outPorts.out.attach sout1

      sin1.post new noflo.IP 'data', 'first'

    it 'should throw an error if sending without specifying a port and there are multiple ports', (done) ->
      f = ->
        c = new noflo.Component
          inPorts:
            in:
              datatype: 'string'
              required: true
          outPorts:
            out:
              datatype: 'all'
            eh:
              required: no
          process: (input, output) ->
            output.sendDone 'test'

        c.inPorts.in.attach sin1
        sin1.post new noflo.IP 'data', 'some-data'
      chai.expect(f).to.throw Error
      done()

    it 'should send errors if there is a connected error port', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
        outPorts:
          error:
            datatype: 'object'
        process: (input, output) ->
          packet = input.get 'in'
          chai.expect(packet.data).to.equal 'some-data'
          chai.expect(packet.scope).to.equal 'some-scope'
          output.sendDone new Error 'Should fail'

      sout1.on 'ip', (ip) ->
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.data).to.be.an.instanceOf Error
        chai.expect(ip.scope).to.equal 'some-scope'
        done()

      c.inPorts.in.attach sin1
      c.outPorts.error.attach sout1
      sin1.post new noflo.IP 'data', 'some-data',
        scope: 'some-scope'

    it 'should send substreams with multiple errors per activation', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
            required: true
        outPorts:
          error:
            datatype: 'object'
        process: (input, output) ->
          packet = input.get 'in'
          chai.expect(packet.data).to.equal 'some-data'
          chai.expect(packet.scope).to.equal 'some-scope'
          errors = []
          errors.push new Error 'One thing is invalid'
          errors.push new Error 'Another thing is invalid'
          output.sendDone errors

      expected = [
        '<'
        'One thing is invalid'
        'Another thing is invalid'
        '>'
      ]
      actual = []
      count = 0

      sout1.on 'ip', (ip) ->
        count++
        chai.expect(ip).to.be.an 'object'
        chai.expect(ip.scope).to.equal 'some-scope'
        actual.push '<' if ip.type is 'openBracket'
        actual.push '>' if ip.type is 'closeBracket'
        if ip.type is 'data'
          chai.expect(ip.data).to.be.an.instanceOf Error
          actual.push ip.data.message
        if count is 4
          chai.expect(actual).to.eql expected
          done()

      c.inPorts.in.attach sin1
      c.outPorts.error.attach sout1
      sin1.post new noflo.IP 'data', 'some-data',
        scope: 'some-scope'

    it 'should forward brackets for map-style components', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
        outPorts:
          out:
            datatype: 'string'
          error:
            datatype: 'object'
        process: (input, output) ->
          str = input.getData()
          if typeof str isnt 'string'
            return output.sendDone new Error 'Input is not string'
          output.pass str.toUpperCase()

      c.inPorts.in.attach sin1
      c.outPorts.out.attach sout1
      c.outPorts.error.attach sout2

      source = [
        '<'
        'foo'
        'bar'
        '>'
      ]
      actual = []
      count = 0

      sout1.on 'ip', (ip) ->
        data = switch ip.type
          when 'openBracket' then '<'
          when 'closeBracket' then '>'
          else ip.data
        chai.expect(data).to.equal source[count].toUpperCase()
        count++
        done() if count is 4

      sout2.on 'ip', (ip) ->
        return if ip.type isnt 'data'
        console.log 'Unexpected error', ip
        done ip.data

      for data in source
        switch data
          when '<' then sin1.post new noflo.IP 'openBracket'
          when '>' then sin1.post new noflo.IP 'closeBracket'
          else sin1.post new noflo.IP 'data', data

    it 'should forward brackets for map-style components with addressable outport', (done) ->
      sent = false
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
        outPorts:
          out:
            datatype: 'string'
            addressable: true
        process: (input, output) ->
          return unless input.hasData()
          string = input.getData()
          idx = if sent then 0 else 1
          sent = true
          output.sendDone new noflo.IP 'data', string,
            index: idx

      c.inPorts.in.attach sin1
      c.outPorts.out.attach sout1, 1
      c.outPorts.out.attach sout2, 0

      expected = [
        '1 < a'
        '1 < foo'
        '1 DATA first'
        '1 > foo'
        '0 < a'
        '0 < bar'
        '0 DATA second'
        '0 > bar'
        '0 > a'
        '1 > a'
      ]
      received = []
      sout1.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "1 < #{ip.data}"
          when 'data'
            received.push "1 DATA #{ip.data}"
          when 'closeBracket'
            received.push "1 > #{ip.data}"
        return unless received.length is expected.length
        chai.expect(received).to.eql expected
        done()
      sout2.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "0 < #{ip.data}"
          when 'data'
            received.push "0 DATA #{ip.data}"
          when 'closeBracket'
            received.push "0 > #{ip.data}"
        return unless received.length is expected.length
        chai.expect(received).to.eql expected
        done()

      sin1.post new noflo.IP 'openBracket', 'a'
      sin1.post new noflo.IP 'openBracket', 'foo'
      sin1.post new noflo.IP 'data', 'first'
      sin1.post new noflo.IP 'closeBracket', 'foo'
      sin1.post new noflo.IP 'openBracket', 'bar'
      sin1.post new noflo.IP 'data', 'second'
      sin1.post new noflo.IP 'closeBracket', 'bar'
      sin1.post new noflo.IP 'closeBracket', 'a'

    it 'should forward brackets for async map-style components with addressable outport', (done) ->
      sent = false
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
        outPorts:
          out:
            datatype: 'string'
            addressable: true
        process: (input, output) ->
          return unless input.hasData()
          string = input.getData()
          idx = if sent then 0 else 1
          sent = true
          setTimeout ->
            output.sendDone new noflo.IP 'data', string,
              index: idx
          , 1

      c.inPorts.in.attach sin1
      c.outPorts.out.attach sout1, 1
      c.outPorts.out.attach sout2, 0

      expected = [
        '1 < a'
        '1 < foo'
        '1 DATA first'
        '1 > foo'
        '0 < a'
        '0 < bar'
        '0 DATA second'
        '0 > bar'
        '0 > a'
        '1 > a'
      ]
      received = []
      sout1.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "1 < #{ip.data}"
          when 'data'
            received.push "1 DATA #{ip.data}"
          when 'closeBracket'
            received.push "1 > #{ip.data}"
        return unless received.length is expected.length
        chai.expect(received).to.eql expected
        done()
      sout2.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "0 < #{ip.data}"
          when 'data'
            received.push "0 DATA #{ip.data}"
          when 'closeBracket'
            received.push "0 > #{ip.data}"
        return unless received.length is expected.length
        chai.expect(received).to.eql expected
        done()

      sin1.post new noflo.IP 'openBracket', 'a'
      sin1.post new noflo.IP 'openBracket', 'foo'
      sin1.post new noflo.IP 'data', 'first'
      sin1.post new noflo.IP 'closeBracket', 'foo'
      sin1.post new noflo.IP 'openBracket', 'bar'
      sin1.post new noflo.IP 'data', 'second'
      sin1.post new noflo.IP 'closeBracket', 'bar'
      sin1.post new noflo.IP 'closeBracket', 'a'

    it 'should forward brackets for map-style components with addressable in/outports', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
            addressable: true
        outPorts:
          out:
            datatype: 'string'
            addressable: true
        process: (input, output) ->
          indexesWithData = []
          for idx in input.attached()
            indexesWithData.push idx if input.hasData ['in', idx]
          return unless indexesWithData.length
          indexToUse = indexesWithData[0]
          data = input.get ['in', indexToUse]
          ip = new noflo.IP 'data', data.data
          ip.index = indexToUse
          output.sendDone ip

      c.inPorts.in.attach sin1, 1
      c.inPorts.in.attach sin2, 0
      c.outPorts.out.attach sout1, 1
      c.outPorts.out.attach sout2, 0

      expected = [
        '1 < a'
        '1 < foo'
        '1 DATA first'
        '1 > foo'
        '0 < bar'
        '0 DATA second'
        '0 > bar'
        '1 > a'
      ]
      received = []
      sout1.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "1 < #{ip.data}"
          when 'data'
            received.push "1 DATA #{ip.data}"
          when 'closeBracket'
            received.push "1 > #{ip.data}"
        return unless received.length is expected.length
        chai.expect(received).to.eql expected
        done()
      sout2.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "0 < #{ip.data}"
          when 'data'
            received.push "0 DATA #{ip.data}"
          when 'closeBracket'
            received.push "0 > #{ip.data}"
        return unless received.length is expected.length
        return unless received.length is expected.length
        chai.expect(received).to.eql expected
        done()

      sin1.post new noflo.IP 'openBracket', 'a'
      sin1.post new noflo.IP 'openBracket', 'foo'
      sin1.post new noflo.IP 'data', 'first'
      sin1.post new noflo.IP 'closeBracket', 'foo'
      sin2.post new noflo.IP 'openBracket', 'bar'
      sin2.post new noflo.IP 'data', 'second'
      sin2.post new noflo.IP 'closeBracket', 'bar'
      sin1.post new noflo.IP 'closeBracket', 'a'

    it 'should forward brackets for async map-style components with addressable in/outports', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
            addressable: true
        outPorts:
          out:
            datatype: 'string'
            addressable: true
        process: (input, output) ->
          indexesWithData = []
          for idx in input.attached()
            indexesWithData.push idx if input.hasData ['in', idx]
          return unless indexesWithData.length
          data = input.get ['in', indexesWithData[0]]
          setTimeout ->
            ip = new noflo.IP 'data', data.data
            ip.index = data.index
            output.sendDone ip
          , 1

      c.inPorts.in.attach sin1, 1
      c.inPorts.in.attach sin2, 0
      c.outPorts.out.attach sout1, 1
      c.outPorts.out.attach sout2, 0

      expected = [
        '1 < a'
        '1 < foo'
        '1 DATA first'
        '1 > foo'
        '0 < bar'
        '0 DATA second'
        '0 > bar'
        '1 > a'
      ]
      received = []
      sout1.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "1 < #{ip.data}"
          when 'data'
            received.push "1 DATA #{ip.data}"
          when 'closeBracket'
            received.push "1 > #{ip.data}"
        return unless received.length is expected.length
        chai.expect(received).to.eql expected
        done()
      sout2.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "0 < #{ip.data}"
          when 'data'
            received.push "0 DATA #{ip.data}"
          when 'closeBracket'
            received.push "0 > #{ip.data}"
        return unless received.length is expected.length
        chai.expect(received).to.eql expected
        done()

      sin1.post new noflo.IP 'openBracket', 'a'
      sin1.post new noflo.IP 'openBracket', 'foo'
      sin1.post new noflo.IP 'data', 'first'
      sin1.post new noflo.IP 'closeBracket', 'foo'
      sin2.post new noflo.IP 'openBracket', 'bar'
      sin2.post new noflo.IP 'data', 'second'
      sin2.post new noflo.IP 'closeBracket', 'bar'
      sin1.post new noflo.IP 'closeBracket', 'a'

    it 'should forward brackets to error port in async components', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
        outPorts:
          out:
            datatype: 'string'
          error:
            datatype: 'object'
        process: (input, output) ->
          str = input.getData()
          setTimeout ->
            if typeof str isnt 'string'
              return output.sendDone new Error 'Input is not string'
            output.pass str.toUpperCase()
          , 10

      c.inPorts.in.attach sin1
      c.outPorts.out.attach sout1
      c.outPorts.error.attach sout2

      sout1.on 'ip', (ip) ->
        # done new Error "Unexpected IP: #{ip.type} #{ip.data}"

      count = 0
      sout2.on 'ip', (ip) ->
        count++
        switch count
          when 1
            chai.expect(ip.type).to.equal 'openBracket'
          when 2
            chai.expect(ip.type).to.equal 'data'
            chai.expect(ip.data).to.be.an 'error'
          when 3
            chai.expect(ip.type).to.equal 'closeBracket'
        done() if count is 3

      sin1.post new noflo.IP 'openBracket', 'foo'
      sin1.post new noflo.IP 'data', { bar: 'baz' }
      sin1.post new noflo.IP 'closeBracket', 'foo'

    it 'should not forward brackets if error port is not connected', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
        outPorts:
          out:
            datatype: 'string'
            required: true
          error:
            datatype: 'object'
            required: true
        process: (input, output) ->
          str = input.getData()
          setTimeout ->
            if typeof str isnt 'string'
              return output.sendDone new Error 'Input is not string'
            output.pass str.toUpperCase()
          , 10

      c.inPorts.in.attach sin1
      c.outPorts.out.attach sout1
      # c.outPorts.error.attach sout2

      sout1.on 'ip', (ip) ->
        done() if ip.type is 'closeBracket'

      sout2.on 'ip', (ip) ->
        done new Error "Unexpected error IP: #{ip.type} #{ip.data}"

      chai.expect ->
        sin1.post new noflo.IP 'openBracket', 'foo'
        sin1.post new noflo.IP 'data', 'bar'
        sin1.post new noflo.IP 'closeBracket', 'foo'
      .to.not.throw()

    it 'should support custom bracket forwarding mappings with auto-ordering', (done) ->
      c = new noflo.Component
        inPorts:
          msg:
            datatype: 'string'
          delay:
            datatype: 'int'
        outPorts:
          out:
            datatype: 'string'
          error:
            datatype: 'object'
        forwardBrackets:
          msg: ['out', 'error']
          delay: ['error']
        process: (input, output) ->
          return unless input.hasData 'msg', 'delay'
          [msg, delay] = input.getData 'msg', 'delay'
          if delay < 0
            return output.sendDone new Error 'Delay is negative'
          setTimeout ->
            output.sendDone
              out: { msg: msg, delay: delay }
          , delay

      c.inPorts.msg.attach sin1
      c.inPorts.delay.attach sin2
      c.outPorts.out.attach sout1
      c.outPorts.error.attach sout2

      sample = [
        { delay: 30, msg: "one" }
        { delay: 0, msg: "two" }
        { delay: 20, msg: "three" }
        { delay: 10, msg: "four" }
        { delay: -40, msg: 'five'}
      ]

      count = 0
      errCount = 0
      sout1.on 'ip', (ip) ->
        src = null
        switch count
          when 0
            chai.expect(ip.type).to.equal 'openBracket'
            chai.expect(ip.data).to.equal 'msg'
          when 5
            chai.expect(ip.type).to.equal 'closeBracket'
            chai.expect(ip.data).to.equal 'msg'
          else src = sample[count - 1]
        chai.expect(ip.data).to.eql src if src
        count++
        # done() if count is 6

      sout2.on 'ip', (ip) ->
        switch errCount
          when 0
            chai.expect(ip.type).to.equal 'openBracket'
            chai.expect(ip.data).to.equal 'msg'
          when 1
            chai.expect(ip.type).to.equal 'openBracket'
            chai.expect(ip.data).to.equal 'delay'
          when 2
            chai.expect(ip.type).to.equal 'data'
            chai.expect(ip.data).to.be.an 'error'
          when 3
            chai.expect(ip.type).to.equal 'closeBracket'
            chai.expect(ip.data).to.equal 'delay'
          when 4
            chai.expect(ip.type).to.equal 'closeBracket'
            chai.expect(ip.data).to.equal 'msg'
        errCount++
        done() if errCount is 5

      sin1.post new noflo.IP 'openBracket', 'msg'
      sin2.post new noflo.IP 'openBracket', 'delay'

      for ip in sample
        sin1.post new noflo.IP 'data', ip.msg
        sin2.post new noflo.IP 'data', ip.delay

      sin2.post new noflo.IP 'closeBracket', 'delay'
      sin1.post new noflo.IP 'closeBracket', 'msg'

    it 'should de-duplicate brackets when asynchronously forwarding from multiple inports', (done) ->
      c = new noflo.Component
        inPorts:
          in1:
            datatype: 'string'
          in2:
            datatype: 'string'
        outPorts:
          out:
            datatype: 'string'
          error:
            datatype: 'object'
        forwardBrackets:
          in1: ['out', 'error']
          in2: ['out', 'error']
        process: (input, output) ->
          return unless input.hasData 'in1', 'in2'
          [one, two] = input.getData 'in1', 'in2'
          setTimeout ->
            output.sendDone
              out: "#{one}:#{two}"
          , 1

      c.inPorts.in1.attach sin1
      c.inPorts.in2.attach sin2
      c.outPorts.out.attach sout1
      c.outPorts.error.attach sout2

      # Fail early on errors
      sout2.on 'ip', (ip) ->
        return unless ip.type is 'data'
        done ip.data

      expected = [
        '< a'
        '< b'
        'DATA one:yksi'
        '< c'
        'DATA two:kaksi'
        '> c'
        'DATA three:kolme'
        '> b'
        '> a'
      ]
      received = [
      ]

      sout1.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "< #{ip.data}"
          when 'data'
            received.push "DATA #{ip.data}"
          when 'closeBracket'
            received.push "> #{ip.data}"
        return unless received.length is expected.length
        chai.expect(received).to.eql expected
        done()

      sin1.post new noflo.IP 'openBracket', 'a'
      sin1.post new noflo.IP 'openBracket', 'b'
      sin1.post new noflo.IP 'data', 'one'
      sin1.post new noflo.IP 'openBracket', 'c'
      sin1.post new noflo.IP 'data', 'two'
      sin1.post new noflo.IP 'closeBracket', 'c'
      sin2.post new noflo.IP 'openBracket', 'a'
      sin2.post new noflo.IP 'openBracket', 'b'
      sin2.post new noflo.IP 'data', 'yksi'
      sin2.post new noflo.IP 'data', 'kaksi'
      sin1.post new noflo.IP 'data', 'three'
      sin1.post new noflo.IP 'closeBracket', 'b'
      sin1.post new noflo.IP 'closeBracket', 'a'
      sin2.post new noflo.IP 'data', 'kolme'
      sin2.post new noflo.IP 'closeBracket', 'b'
      sin2.post new noflo.IP 'closeBracket', 'a'

    it 'should de-duplicate brackets when synchronously forwarding from multiple inports', (done) ->
      c = new noflo.Component
        inPorts:
          in1:
            datatype: 'string'
          in2:
            datatype: 'string'
        outPorts:
          out:
            datatype: 'string'
          error:
            datatype: 'object'
        forwardBrackets:
          in1: ['out', 'error']
          in2: ['out', 'error']
        process: (input, output) ->
          return unless input.hasData 'in1', 'in2'
          [one, two] = input.getData 'in1', 'in2'
          output.sendDone
            out: "#{one}:#{two}"

      c.inPorts.in1.attach sin1
      c.inPorts.in2.attach sin2
      c.outPorts.out.attach sout1
      c.outPorts.error.attach sout2

      # Fail early on errors
      sout2.on 'ip', (ip) ->
        return unless ip.type is 'data'
        done ip.data

      expected = [
        '< a'
        '< b'
        'DATA one:yksi'
        '< c'
        'DATA two:kaksi'
        '> c'
        'DATA three:kolme'
        '> b'
        '> a'
      ]
      received = [
      ]

      sout1.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "< #{ip.data}"
          when 'data'
            received.push "DATA #{ip.data}"
          when 'closeBracket'
            received.push "> #{ip.data}"
        return unless received.length is expected.length
        chai.expect(received).to.eql expected
        done()

      sin1.post new noflo.IP 'openBracket', 'a'
      sin1.post new noflo.IP 'openBracket', 'b'
      sin1.post new noflo.IP 'data', 'one'
      sin1.post new noflo.IP 'openBracket', 'c'
      sin1.post new noflo.IP 'data', 'two'
      sin1.post new noflo.IP 'closeBracket', 'c'
      sin2.post new noflo.IP 'openBracket', 'a'
      sin2.post new noflo.IP 'openBracket', 'b'
      sin2.post new noflo.IP 'data', 'yksi'
      sin2.post new noflo.IP 'data', 'kaksi'
      sin1.post new noflo.IP 'data', 'three'
      sin1.post new noflo.IP 'closeBracket', 'b'
      sin1.post new noflo.IP 'closeBracket', 'a'
      sin2.post new noflo.IP 'data', 'kolme'
      sin2.post new noflo.IP 'closeBracket', 'b'
      sin2.post new noflo.IP 'closeBracket', 'a'

    it 'should not apply auto-ordering if that option is false', (done) ->
      c = new noflo.Component
        inPorts:
          msg: datatype: 'string'
          delay: datatype: 'int'
        outPorts:
          out: datatype: 'object'
        ordered: false
        autoOrdering: false
        process: (input, output) ->
          # Skip brackets
          return input.get input.port.name if input.ip.type isnt 'data'
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
      sout1.on 'ip', (ip) ->
        count++
        switch count
          when 1 then src = sample[1]
          when 2 then src = sample[3]
          when 3 then src = sample[2]
          when 4 then src = sample[0]
        chai.expect(ip.data).to.eql src
        done() if count is 4

      sin1.post new noflo.IP 'openBracket', 'msg'
      sin2.post new noflo.IP 'openBracket', 'delay'

      for ip in sample
        sin1.post new noflo.IP 'data', ip.msg
        sin2.post new noflo.IP 'data', ip.delay

      sin1.post new noflo.IP 'closeBracket', 'msg'
      sin2.post new noflo.IP 'closeBracket', 'delay'

    it 'should forward noflo.IP metadata for map-style components', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
        outPorts:
          out:
            datatype: 'string'
          error:
            datatype: 'object'
        process: (input, output) ->
          str = input.getData()
          if typeof str isnt 'string'
            return output.sendDone new Error 'Input is not string'
          output.pass str.toUpperCase()

      c.inPorts.in.attach sin1
      c.outPorts.out.attach sout1
      c.outPorts.error.attach sout2

      source = [
        'foo'
        'bar'
        'baz'
      ]
      count = 0
      sout1.on 'ip', (ip) ->
        chai.expect(ip.type).to.equal 'data'
        chai.expect(ip.count).to.be.a 'number'
        chai.expect(ip.length).to.be.a 'number'
        chai.expect(ip.data).to.equal source[ip.count].toUpperCase()
        chai.expect(ip.length).to.equal source.length
        count++
        done() if count is source.length

      sout2.on 'ip', (ip) ->
        console.log 'Unexpected error', ip
        done ip.data

      n = 0
      for str in source
        sin1.post new noflo.IP 'data', str,
          count: n++
          length: source.length

    it 'should be safe dropping IPs', (done) ->
      c = new noflo.Component
        inPorts:
          in:
            datatype: 'string'
        outPorts:
          out:
            datatype: 'string'
          error:
            datatype: 'object'
        process: (input, output) ->
          data = input.get 'in'
          data.drop()
          output.done()
          done()

      c.inPorts.in.attach sin1
      c.outPorts.out.attach sout1
      c.outPorts.error.attach sout2

      sout1.on 'ip', (ip) ->
        done ip

      sin1.post new noflo.IP 'data', 'foo',
        meta: 'bar'

    describe 'with custom callbacks', ->

      beforeEach (done) ->
        c = new noflo.Component
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
          process: (input, output) ->
            return unless input.has 'foo', 'bar'
            [foo, bar] = input.getData 'foo', 'bar'
            if bar < 0 or bar > 1000
              return output.sendDone
                err: new Error "Bar is not correct: #{bar}"
            # Start capturing output
            input.activate()
            output.send
              baz: new noflo.IP 'openBracket'
            baz =
              foo: foo
              bar: bar
            output.send
              baz: baz
            setTimeout ->
              output.send
                baz: new noflo.IP 'closeBracket'
              output.done()
            , bar
        c.inPorts.foo.attach sin1
        c.inPorts.bar.attach sin2
        c.outPorts.baz.attach sout1
        c.outPorts.err.attach sout2
        done()

      it 'should fail on wrong input', (done) ->
        sout1.once 'ip', (ip) ->
          done new Error 'Unexpected baz'
        sout2.once 'ip', (ip) ->
          chai.expect(ip).to.be.an 'object'
          chai.expect(ip.data).to.be.an 'error'
          chai.expect(ip.data.message).to.contain 'Bar'
          done()

        sin1.post new noflo.IP 'data', 'fff'
        sin2.post new noflo.IP 'data', -120

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
        sout1.on 'ip', (ip) ->
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
        sout2.once 'ip', (ip) ->
          done ip.data

        for item in sample
          sin2.post new noflo.IP 'data', item.bar
          sin1.post new noflo.IP 'data', item.foo

    describe 'using streams', ->
      it 'should not trigger without a full stream without getting the whole stream', (done) ->
        c = new noflo.Component
          inPorts:
            in:
              datatype: 'string'
          outPorts:
            out:
              datatype: 'string'
          process: (input, output) ->
            if input.hasStream 'in'
              done new Error 'should never trigger this'

            if (input.has 'in', (ip) -> ip.type is 'closeBracket')
              done()

        c.forwardBrackets = {}
        c.inPorts.in.attach sin1

        sin1.post new noflo.IP 'openBracket'
        sin1.post new noflo.IP 'openBracket'
        sin1.post new noflo.IP 'openBracket'
        sin1.post new noflo.IP 'data', 'eh'
        sin1.post new noflo.IP 'closeBracket'

      it 'should trigger when forwardingBrackets because then it is only data with no brackets and is a full stream', (done) ->
        c = new noflo.Component
          inPorts:
            in:
              datatype: 'string'
          outPorts:
            out:
              datatype: 'string'
          process: (input, output) ->
            return unless input.hasStream 'in'
            done()
        c.forwardBrackets =
          in: ['out']

        c.inPorts.in.attach sin1
        sin1.post new noflo.IP 'data', 'eh'

      it 'should get full stream when it has a single packet stream and it should clear it', (done) ->
        c = new noflo.Component
          inPorts:
            eh:
              datatype: 'string'
          outPorts:
            canada:
              datatype: 'string'
          process: (input, output) ->
            return unless input.hasStream 'eh'
            stream = input.getStream 'eh'
            packetTypes = stream.map (ip) -> [ip.type, ip.data]
            chai.expect(packetTypes).to.eql [
              ['data', 'moose']
            ]
            chai.expect(input.has('eh')).to.equal false
            done()

        c.inPorts.eh.attach sin1
        sin1.post new noflo.IP 'data', 'moose'
      it 'should get full stream when it has a full stream, and it should clear it', (done) ->
        c = new noflo.Component
          inPorts:
            eh:
              datatype: 'string'
          outPorts:
            canada:
              datatype: 'string'
          process: (input, output) ->
            return unless input.hasStream 'eh'
            stream = input.getStream 'eh'
            packetTypes = stream.map (ip) -> [ip.type, ip.data]
            chai.expect(packetTypes).to.eql [
              ['openBracket', null]
              ['openBracket', 'foo']
              ['data', 'moose']
              ['closeBracket', 'foo']
              ['closeBracket', null]
            ]
            chai.expect(input.has('eh')).to.equal false
            done()

        c.inPorts.eh.attach sin1
        sin1.post new noflo.IP 'openBracket'
        sin1.post new noflo.IP 'openBracket', 'foo'
        sin1.post new noflo.IP 'data', 'moose'
        sin1.post new noflo.IP 'closeBracket', 'foo'
        sin1.post new noflo.IP 'closeBracket'
      it 'should get data when it has a full stream', (done) ->
        c = new noflo.Component
          inPorts:
            eh:
              datatype: 'string'
          outPorts:
            canada:
              datatype: 'string'
          forwardBrackets:
            eh: ['canada']
          process: (input, output) ->
            return unless input.hasStream 'eh'
            data = input.get 'eh'
            chai.expect(data.type).to.equal 'data'
            chai.expect(data.data).to.equal 'moose'
            output.sendDone data

        expected = [
          ['openBracket', null]
          ['openBracket', 'foo']
          ['data', 'moose']
          ['closeBracket', 'foo']
          ['closeBracket', null]
        ]
        received = []
        sout1.on 'ip', (ip) ->
          received.push [ip.type, ip.data]
          return unless received.length is expected.length
          chai.expect(received).to.eql expected
          done()
        c.inPorts.eh.attach sin1
        c.outPorts.canada.attach sout1
        sin1.post new noflo.IP 'openBracket'
        sin1.post new noflo.IP 'openBracket', 'foo'
        sin1.post new noflo.IP 'data', 'moose'
        sin1.post new noflo.IP 'closeBracket', 'foo'
        sin1.post new noflo.IP 'closeBracket'

    describe 'with a simple ordered stream', ->
      it 'should send packets with brackets in expected order when synchronous', (done) ->
        received = []
        c = new noflo.Component
          inPorts:
            in:
              datatype: 'string'
          outPorts:
            out:
              datatype: 'string'
          process: (input, output) ->
            return unless input.has 'in'
            data = input.getData 'in'
            output.sendDone
              out: data
        c.nodeId = 'Issue465'
        c.inPorts.in.attach sin1
        c.outPorts.out.attach sout1

        sout1.on 'ip', (ip) ->
          if ip.type is 'openBracket'
            return unless ip.data
            received.push "< #{ip.data}"
            return
          if ip.type is 'closeBracket'
            return unless ip.data
            received.push "> #{ip.data}"
            return
          received.push ip.data
        sout1.on 'disconnect', ->
          chai.expect(received).to.eql [
            '< 1'
            '< 2'
            'A'
            '> 2'
            'B'
            '> 1'
          ]
          done()
        sin1.connect()
        sin1.beginGroup 1
        sin1.beginGroup 2
        sin1.send 'A'
        sin1.endGroup()
        sin1.send 'B'
        sin1.endGroup()
        sin1.disconnect()
      it 'should send packets with brackets in expected order when asynchronous', (done) ->
        received = []
        c = new noflo.Component
          inPorts:
            in:
              datatype: 'string'
          outPorts:
            out:
              datatype: 'string'
          process: (input, output) ->
            return unless input.has 'in'
            data = input.getData 'in'
            setTimeout ->
              output.sendDone
                out: data
            , 1
        c.nodeId = 'Issue465'
        c.inPorts.in.attach sin1
        c.outPorts.out.attach sout1

        sout1.on 'ip', (ip) ->
          if ip.type is 'openBracket'
            return unless ip.data
            received.push "< #{ip.data}"
            return
          if ip.type is 'closeBracket'
            return unless ip.data
            received.push "> #{ip.data}"
            return
          received.push ip.data
        sout1.on 'disconnect', ->
          chai.expect(received).to.eql [
            '< 1'
            '< 2'
            'A'
            '> 2'
            'B'
            '> 1'
          ]
          done()

        sin1.connect()
        sin1.beginGroup 1
        sin1.beginGroup 2
        sin1.send 'A'
        sin1.endGroup()
        sin1.send 'B'
        sin1.endGroup()
        sin1.disconnect()

  describe 'with generator components', ->
    c = null
    sin1 = null
    sin2 = null
    sin3 = null
    sout1 = null
    sout2 = null
    before (done) ->
      c = new noflo.Component
        inPorts:
          interval:
            datatype: 'number'
            control: true
          start: datatype: 'bang'
          stop: datatype: 'bang'
        outPorts:
          out: datatype: 'bang'
          err: datatype: 'object'
        timer: null
        ordered: false
        autoOrdering: false
        process: (input, output, context) ->
          return unless input.has 'interval'
          if input.has 'start'
            start = input.get 'start'
            interval = parseInt input.getData 'interval'
            clearInterval @timer if @timer
            @timer = setInterval ->
              context.activate()
              setTimeout ->
                output.ports.out.sendIP new noflo.IP 'data', true
                context.deactivate()
              , 5 # delay of 3 to test async
            , interval
          if input.has 'stop'
            stop = input.get 'stop'
            clearInterval @timer if @timer
          output.done()

      sin1 = new noflo.internalSocket.InternalSocket
      sin2 = new noflo.internalSocket.InternalSocket
      sin3 = new noflo.internalSocket.InternalSocket
      sout1 = new noflo.internalSocket.InternalSocket
      sout2 = new noflo.internalSocket.InternalSocket
      c.inPorts.interval.attach sin1
      c.inPorts.start.attach sin2
      c.inPorts.stop.attach sin3
      c.outPorts.out.attach sout1
      c.outPorts.err.attach sout2
      done()

    it 'should emit start event when started', (done) ->
      c.on 'start', ->
        chai.expect(c.started).to.be.true
        done()
      c.start (err) ->
        return done err if err

    it 'should emit activate/deactivate event on every tick', (done) ->
      @timeout 100
      count = 0
      dcount = 0
      c.on 'activate', (load) ->
        count++
      c.on 'deactivate', (load) ->
        dcount++
        # Stop when the stack of processes grows
        if count is 3 and dcount is 3
          sin3.post new noflo.IP 'data', true
          done()
      sin1.post new noflo.IP 'data', 2
      sin2.post new noflo.IP 'data', true

    it 'should emit end event when stopped and no activate after it', (done) ->
      c.on 'end', ->
        chai.expect(c.started).to.be.false
        done()
      c.on 'activate', (load) ->
        unless c.started
          done new Error 'Unexpected activate after end'
      c.shutdown (err) ->
        done err if err
