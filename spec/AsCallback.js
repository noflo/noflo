if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo'
  path = require 'path'
  root = path.resolve __dirname, '../'
  urlPrefix = './'
else
  noflo = require 'noflo'
  root = 'noflo'
  urlPrefix = '/'

describe 'asCallback interface', ->
  loader = null

  processAsync = ->
    c = new noflo.Component
    c.inPorts.add 'in',
      datatype: 'string'
    c.outPorts.add 'out',
      datatype: 'string'

    c.process (input, output) ->
      data = input.getData 'in'
      setTimeout ->
        output.sendDone data
      , 1
      return
  processError = ->
    c = new noflo.Component
    c.inPorts.add 'in',
      datatype: 'string'
    c.outPorts.add 'out',
      datatype: 'string'
    c.outPorts.add 'error'
    c.process (input, output) ->
      data = input.getData 'in'
      output.done new Error "Received #{data}"
      return
  processValues = ->
    c = new noflo.Component
    c.inPorts.add 'in',
      datatype: 'string'
      values: ['green', 'blue']
    c.outPorts.add 'out',
      datatype: 'string'
    c.process (input, output) ->
      data = input.getData 'in'
      output.sendDone data
      return
  neverSend = ->
    c = new noflo.Component
    c.inPorts.add 'in',
      datatype: 'string'
    c.outPorts.add 'out',
      datatype: 'string'
    c.process (input, output) ->
      data = input.getData 'in'
      return
  streamify = ->
    c = new noflo.Component
    c.inPorts.add 'in',
      datatype: 'string'
    c.outPorts.add 'out',
      datatype: 'string'
    c.process (input, output) ->
      data = input.getData 'in'
      words = data.split ' '
      for word, idx in words
        output.send new noflo.IP 'openBracket', idx
        chars = word.split ''
        output.send new noflo.IP 'data', char for char in chars
        output.send new noflo.IP 'closeBracket', idx
      output.done()
      return
    return c

  before (done) ->
    loader = new noflo.ComponentLoader root
    loader.listComponents (err) ->
      if err
        done err
        return
      loader.registerComponent 'process', 'Async', processAsync
      loader.registerComponent 'process', 'Error', processError
      loader.registerComponent 'process', 'Values', processValues
      loader.registerComponent 'process', 'NeverSend', neverSend
      loader.registerComponent 'process', 'Streamify', streamify
      done()
      return
    return
  describe 'with a non-existing component', ->
    wrapped = null
    before ->
      wrapped = noflo.asCallback 'foo/Bar',
        loader: loader
      return
    it 'should be able to wrap it', (done) ->
      chai.expect(wrapped).to.be.a 'function'
      chai.expect(wrapped.length).to.equal 2
      done()
      return
    it 'should fail execution', (done) ->
      wrapped 1, (err) ->
        chai.expect(err).to.be.an 'error'
        done()
        return
      return
    return
  describe 'with simple asynchronous component', ->
    wrapped = null
    before ->
      wrapped = noflo.asCallback 'process/Async',
        loader: loader
      return
    it 'should be able to wrap it', (done) ->
      chai.expect(wrapped).to.be.a 'function'
      chai.expect(wrapped.length).to.equal 2
      done()
      return
    it 'should execute network with input map and provide output map', (done) ->
      expected =
        hello: 'world'

      wrapped
        in: expected
      , (err, out) ->
        if err
          done err
          return
        chai.expect(out.out).to.eql expected
        done()
        return
      return
    it 'should execute network with simple input and provide simple output', (done) ->
      expected =
        hello: 'world'

      wrapped expected, (err, out) ->
        if err
          done err
          return
        chai.expect(out).to.eql expected
        done()
        return
      return
    it 'should not mix up simultaneous runs', (done) ->
      received = 0
      [0..100].forEach (idx) ->
        wrapped idx, (err, out) ->
          if err
            done err
            return
          chai.expect(out).to.equal idx
          received++
          return unless received is 101
          done()
          return
        return
      return
    it 'should execute a network with a sequence and provide output sequence', (done) ->
      sent = [
        in: 'hello'
      ,
        in: 'world'
      ,
        in: 'foo'
      ,
        in: 'bar'
      ]
      expected = sent.map (portmap) ->
        return res =
          out: portmap.in
      wrapped sent, (err, out) ->
        if err
          done err
          return
        chai.expect(out).to.eql expected
        done()
        return
      return
    describe 'with the raw option', ->
      it 'should execute a network with a sequence and provide output sequence', (done) ->
        wrappedRaw = noflo.asCallback 'process/Async',
          loader: loader
          raw: true
        sent = [
          in: new noflo.IP 'openBracket', 'a'
        ,
          in: 'hello'
        ,
          in: 'world'
        ,
          in: new noflo.IP 'closeBracket', 'a'
        ,
          in: new noflo.IP 'openBracket', 'b'
        ,
          in: 'foo'
        ,
          in: 'bar'
        ,
          in: new noflo.IP 'closeBracket', 'b'
        ]
        wrappedRaw sent, (err, out) ->
          if err
            done err
            return
          types = out.map (map) -> "#{map.out.type} #{map.out.data}"
          chai.expect(types).to.eql [
            'openBracket a'
            'data hello'
            'data world'
            'closeBracket a'
            'openBracket b'
            'data foo'
            'data bar'
            'closeBracket b'
          ]
          done()
          return
        return
      return
    return
  describe 'with a component sending an error', ->
    wrapped = null
    before ->
      wrapped = noflo.asCallback 'process/Error',
        loader: loader
      return
    it 'should execute network with input map and provide error', (done) ->
      expected = 'hello there'
      wrapped
        in: expected
      , (err) ->
        chai.expect(err).to.be.an 'error'
        chai.expect(err.message).to.contain expected
        done()
        return
      return
    it 'should execute network with simple input and provide error', (done) ->
      expected = 'hello world'
      wrapped expected, (err) ->
        chai.expect(err).to.be.an 'error'
        chai.expect(err.message).to.contain expected
        done()
        return
      return
    return
  describe 'with a component supporting only certain values', ->
    wrapped = null
    before ->
      wrapped = noflo.asCallback 'process/Values',
        loader: loader
      return
    it 'should execute network with input map and provide output map', (done) ->
      expected ='blue'
      wrapped
        in: expected
      , (err, out) ->
        if err
          done err
          return
        chai.expect(out.out).to.eql expected
        done()
        return
      return
    it 'should execute network with simple input and provide simple output', (done) ->
      expected = 'blue'
      wrapped expected, (err, out) ->
        if err
          done err
          return
        chai.expect(out).to.eql expected
        done()
        return
      return
    it 'should execute network with wrong map and provide error', (done) ->
      expected = 'red'
      wrapped
        in: 'red'
      , (err) ->
        chai.expect(err).to.be.an 'error'
        chai.expect(err.message).to.contain 'Invalid data=\'red\' received, not in [green,blue]'
        done()
        return
      return
    it 'should execute network with wrong input and provide error', (done) ->
      wrapped 'red', (err) ->
        chai.expect(err).to.be.an 'error'
        chai.expect(err.message).to.contain 'Invalid data=\'red\' received, not in [green,blue]'
        done()
        return
      return
    return
  describe 'with a component sending streams', ->
    wrapped = null
    before ->
      wrapped = noflo.asCallback 'process/Streamify',
        loader: loader
      return
    it 'should execute network with input map and provide output map with streams as arrays', (done) ->
      wrapped
        in: 'hello world'
      , (err, out) ->
        chai.expect(out.out).to.eql [
          ['h','e','l','l','o']
          ['w','o','r','l','d']
        ]
        done()
        return
      return
    it 'should execute network with simple input and and provide simple output with streams as arrays', (done) ->
      wrapped 'hello there', (err, out) ->
        chai.expect(out).to.eql [
          ['h','e','l','l','o']
          ['t','h','e','r','e']
        ]
        done()
        return
      return
    describe 'with the raw option', ->
      it 'should execute network with input map and provide output map with IP objects', (done) ->
        wrappedRaw = noflo.asCallback 'process/Streamify',
          loader: loader
          raw: true
        wrappedRaw
          in: 'hello world'
        , (err, out) ->
          types = out.out.map (ip) -> "#{ip.type} #{ip.data}"
          chai.expect(types).to.eql [
            'openBracket 0'
            'data h'
            'data e'
            'data l'
            'data l'
            'data o'
            'closeBracket 0'
            'openBracket 1'
            'data w'
            'data o'
            'data r'
            'data l'
            'data d'
            'closeBracket 1'
          ]
          done()
          return
        return
      return
    return
  describe 'with a graph instead of component name', ->
    graph = null
    wrapped = null
    before (done) ->
      noflo.graph.loadFBP """
      INPORT=Async.IN:IN
      OUTPORT=Stream.OUT:OUT
      Async(process/Async) OUT -> IN Stream(process/Streamify)
      """, (err, g) ->
        if err
          done err
          return
        graph = g
        wrapped = noflo.asCallback graph,
          loader: loader
        done()
        return
      return
    it 'should execute network with input map and provide output map with streams as arrays', (done) ->
      wrapped
        in: 'hello world'
      , (err, out) ->
        if err
          done err
          return
        chai.expect(out.out).to.eql [
          ['h','e','l','l','o']
          ['w','o','r','l','d']
        ]
        done()
        return
      return
    it 'should execute network with simple input and and provide simple output with streams as arrays', (done) ->
      wrapped 'hello there', (err, out) ->
        if err
          done err
          return
        chai.expect(out).to.eql [
          ['h','e','l','l','o']
          ['t','h','e','r','e']
        ]
        done()
        return
      return
    return
  describe 'with a graph containing a component supporting only certain values', ->
    graph = null
    wrapped = null
    before (done) ->
      noflo.graph.loadFBP """
      INPORT=Async.IN:IN
      OUTPORT=Values.OUT:OUT
      Async(process/Async) OUT -> IN Values(process/Values)
      """, (err, g) ->
        if err
          done err
          return
        graph = g
        wrapped = noflo.asCallback graph,
          loader: loader
        done()
        return
      return
    it 'should execute network with input map and provide output map', (done) ->
      expected ='blue'
      wrapped
        in: expected
      , (err, out) ->
        if err
          done err
          return
        chai.expect(out.out).to.eql expected
        done()
        return
      return
    it 'should execute network with simple input and provide simple output', (done) ->
      expected = 'blue'
      wrapped expected, (err, out) ->
        if err
          done err
          return
        chai.expect(out).to.eql expected
        done()
        return
      return
    it 'should execute network with wrong map and provide error', (done) ->
      expected = 'red'
      wrapped
        in: 'red'
      , (err) ->
        chai.expect(err).to.be.an 'error'
        chai.expect(err.message).to.contain 'Invalid data=\'red\' received, not in [green,blue]'
        done()
        return
      return
    it 'should execute network with wrong input and provide error', (done) ->
      wrapped 'red', (err) ->
        chai.expect(err).to.be.an 'error'
        chai.expect(err.message).to.contain 'Invalid data=\'red\' received, not in [green,blue]'
        done()
        return
      return
    return
  return