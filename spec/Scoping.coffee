if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo.coffee'
  path = require 'path'
  root = path.resolve __dirname, '../'
  urlPrefix = './'
else
  noflo = require 'noflo'
  root = 'noflo'
  urlPrefix = '/'

wirePatternAsync = ->
  c = new noflo.Component
  c.inPorts.add 'in',
    datatype: 'string'
  c.outPorts.add 'out',
    datatype: 'string'

  noflo.helpers.WirePattern c,
    in: 'in'
    out: 'out'
    async: true
    forwardGroups: true
  , (data, groups, out, callback) ->
    setTimeout ->
      out.send data + c.nodeId
      callback()
    , 1

processAsync = ->
  c = new noflo.Component
  c.inPorts.add 'in',
    datatype: 'string'
  c.outPorts.add 'out',
    datatype: 'string'

  c.process (input, output) ->
    data = input.getData 'in'
    setTimeout ->
      output.sendDone data + c.nodeId
    , 1

describe 'Scope isolation', ->
  loader = null
  before (done) ->
    loader = new noflo.ComponentLoader root
    loader.listComponents (err) ->
      return done err if err
      loader.registerComponent 'wirepattern', 'Async', wirePatternAsync
      loader.registerComponent 'process', 'Async', processAsync
      done()

  describe 'with WirePattern sending to Process API', ->
    c = null
    ins = null
    out = null
    before (done) ->
      fbpData = "
      INPORT=Wp.IN:IN
      OUTPORT=Pc.OUT:OUT
      Wp(wirepattern/Async) OUT -> IN Pc(process/Async)
      "
      noflo.graph.loadFBP fbpData, (err, g) ->
        return done err if err
        loader.registerComponent 'scope', 'Connected', g
        loader.load 'scope/Connected', (err, instance) ->
          return done err if err
          c = instance
          ins = noflo.internalSocket.createSocket()
          c.inPorts.in.attach ins
          done()
    beforeEach ->
      out = noflo.internalSocket.createSocket()
      c.outPorts.out.attach out
    afterEach ->
      c.outPorts.out.detach out
      out = null

    it 'should forward old-style groups as expected', (done) ->
      expected = [
        'CONN'
        '< 1'
        '< a'
        'DATA bazWpPc'
        '>'
        '>'
        'DISC'
      ]
      received = []

      out.on 'connect', ->
        received.push 'CONN'
      out.on 'begingroup', (group) ->
        received.push "< #{group}"
      out.on 'data', (data) ->
        received.push "DATA #{data}"
      out.on 'endgroup', ->
        received.push '>'
      out.on 'disconnect', ->
        received.push 'DISC'
        chai.expect(received).to.eql expected
        done()

      ins.connect()
      ins.beginGroup 1
      ins.beginGroup 'a'
      ins.send 'baz'
      ins.endGroup()
      ins.endGroup()
      ins.disconnect()
    it 'should forward new-style brackets as expected', (done) ->
      expected = [
        '< 1'
        '< a'
        'DATA fooWpPc'
        '>'
        '>'
      ]
      received = []
      brackets = []

      out.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "< #{ip.data}"
            brackets.push ip.data
          when 'data'
            received.push "DATA #{ip.data}"
          when 'closeBracket'
            received.push '>'
            brackets.pop()
            return if brackets.length
            chai.expect(received).to.eql expected
            done()

      ins.post new noflo.IP 'openBracket', 1
      ins.post new noflo.IP 'openBracket', 'a'
      ins.post new noflo.IP 'data', 'foo'
      ins.post new noflo.IP 'closeBracket', 'a'
      ins.post new noflo.IP 'closeBracket', 1
