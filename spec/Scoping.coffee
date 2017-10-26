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

wirePatternMerge = ->
  c = new noflo.Component
  c.inPorts.add 'in1',
    datatype: 'string'
  c.inPorts.add 'in2',
    datatype: 'string'
  c.outPorts.add 'out',
    datatype: 'string'

  noflo.helpers.WirePattern c,
    in: ['in1', 'in2']
    out: 'out'
    async: true
    forwardGroups: true
  , (data, groups, out, callback) ->
    out.send "1#{data['in1']}#{c.nodeId}2#{data['in2']}#{c.nodeId}"
    callback()

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

processMerge = ->
  c = new noflo.Component
  c.inPorts.add 'in1',
    datatype: 'string'
  c.inPorts.add 'in2',
    datatype: 'string'
  c.outPorts.add 'out',
    datatype: 'string'

  c.forwardBrackets =
    'in1': ['out']

  c.process (input, output) ->
    return unless input.has 'in1', 'in2', (ip) -> ip.type is 'data'
    first = input.getData 'in1'
    second = input.getData 'in2'

    output.sendDone
      out: "1#{first}:2#{second}:#{c.nodeId}"

processMergeUnscoped = ->
  c = new noflo.Component
  c.inPorts.add 'in1',
    datatype: 'string'
  c.inPorts.add 'in2',
    datatype: 'string'
    scoped: false
  c.outPorts.add 'out',
    datatype: 'string'

  c.forwardBrackets =
    'in1': ['out']

  c.process (input, output) ->
    return unless input.has 'in1', 'in2', (ip) -> ip.type is 'data'
    first = input.getData 'in1'
    second = input.getData 'in2'

    output.sendDone
      out: "1#{first}:2#{second}:#{c.nodeId}"

processUnscope = ->
  c = new noflo.Component
  c.inPorts.add 'in',
    datatype: 'string'
  c.outPorts.add 'out',
    datatype: 'string'
    scoped: false

  c.process (input, output) ->
    data = input.getData 'in'
    setTimeout ->
      output.sendDone data + c.nodeId
    , 1

# Merge with an addressable port
processMergeA = ->
  c = new noflo.Component
  c.inPorts.add 'in1',
    datatype: 'string'
  c.inPorts.add 'in2',
    datatype: 'string'
    addressable: true
  c.outPorts.add 'out',
    datatype: 'string'

  c.forwardBrackets =
    'in1': ['out']

  c.process (input, output) ->
    return unless input.hasData 'in1', ['in2', 0], ['in2', 1]
    first = input.getData 'in1'
    second0 = input.getData ['in2', 0]
    second1 = input.getData ['in2', 1]

    output.sendDone
      out: "1#{first}:2#{second0}:2#{second1}:#{c.nodeId}"

describe 'Scope isolation', ->
  loader = null
  before (done) ->
    loader = new noflo.ComponentLoader root
    loader.listComponents (err) ->
      return done err if err
      loader.registerComponent 'wirepattern', 'Async', wirePatternAsync
      loader.registerComponent 'wirepattern', 'Merge', wirePatternMerge
      loader.registerComponent 'process', 'Async', processAsync
      loader.registerComponent 'process', 'Merge', processMerge
      loader.registerComponent 'process', 'MergeA', processMergeA
      loader.registerComponent 'process', 'Unscope', processUnscope
      loader.registerComponent 'process', 'MergeUnscoped', processMergeUnscoped
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
    it 'should forward scopes as expected', (done) ->
      expected = [
        'x < 1'
        'x < a'
        'x DATA barWpPc'
        'x >'
        'x >'
      ]
      received = []
      brackets = []

      out.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "#{ip.scope} < #{ip.data}"
            brackets.push ip.data
          when 'data'
            received.push "#{ip.scope} DATA #{ip.data}"
          when 'closeBracket'
            received.push "#{ip.scope} >"
            brackets.pop()
            return if brackets.length
            chai.expect(received).to.eql expected
            done()

      ins.post new noflo.IP 'openBracket', 1,
        scope: 'x'
      ins.post new noflo.IP 'openBracket', 'a',
        scope: 'x'
      ins.post new noflo.IP 'data', 'bar',
        scope: 'x'
      ins.post new noflo.IP 'closeBracket', 'a',
        scope: 'x'
      ins.post new noflo.IP 'closeBracket', 1,
        scope: 'x'

  describe 'pure Process API merging two inputs', ->
    c = null
    in1 = null
    in2 = null
    out = null
    before (done) ->
      fbpData = "
      INPORT=Pc1.IN:IN1
      INPORT=Pc2.IN:IN2
      OUTPORT=PcMerge.OUT:OUT
      Pc1(process/Async) OUT -> IN1 PcMerge(process/Merge)
      Pc2(process/Async) OUT -> IN2 PcMerge(process/Merge)
      "
      noflo.graph.loadFBP fbpData, (err, g) ->
        return done err if err
        loader.registerComponent 'scope', 'Merge', g
        loader.load 'scope/Merge', (err, instance) ->
          return done err if err
          c = instance
          in1 = noflo.internalSocket.createSocket()
          c.inPorts.in1.attach in1
          in2 = noflo.internalSocket.createSocket()
          c.inPorts.in2.attach in2
          done()
    beforeEach ->
      out = noflo.internalSocket.createSocket()
      c.outPorts.out.attach out
    afterEach ->
      c.outPorts.out.detach out
      out = null

    it 'should forward new-style brackets as expected', (done) ->
      expected = [
        'CONN'
        '< 1'
        '< a'
        'DATA 1bazPc1:2fooPc2:PcMerge'
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

      in2.connect()
      in2.send 'foo'
      in2.disconnect()
      in1.connect()
      in1.beginGroup 1
      in1.beginGroup 'a'
      in1.send 'baz'
      in1.endGroup()
      in1.endGroup()
      in1.disconnect()
    it 'should forward new-style brackets as expected regardless of sending order', (done) ->
      expected = [
        'CONN'
        '< 1'
        '< a'
        'DATA 1bazPc1:2fooPc2:PcMerge'
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

      in1.connect()
      in1.beginGroup 1
      in1.beginGroup 'a'
      in1.send 'baz'
      in1.endGroup()
      in1.endGroup()
      in1.disconnect()
      in2.connect()
      in2.send 'foo'
      in2.disconnect()
    it 'should forward scopes as expected', (done) ->
      expected = [
        'x < 1'
        'x DATA 1onePc1:2twoPc2:PcMerge'
        'x >'
      ]
      received = []
      brackets = []

      out.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "#{ip.scope} < #{ip.data}"
            brackets.push ip.data
          when 'data'
            received.push "#{ip.scope} DATA #{ip.data}"
          when 'closeBracket'
            received.push "#{ip.scope} >"
            brackets.pop()
            return if brackets.length
            chai.expect(received).to.eql expected
            done()

      in2.post new noflo.IP 'data', 'two',
        scope: 'x'
      in1.post new noflo.IP 'openBracket', 1,
        scope: 'x'
      in1.post new noflo.IP 'data', 'one',
        scope: 'x'
      in1.post new noflo.IP 'closeBracket', 1,
        scope: 'x'
    it 'should not forward when scopes don\'t match', (done) ->
      out.on 'ip', (ip) ->
        throw new Error "Received unexpected #{ip.type} packet"
      c.network.once 'end', ->
        done()
      in2.post new noflo.IP 'data', 'two', scope: 2
      in1.post new noflo.IP 'openBracket', 1, scope: 1
      in1.post new noflo.IP 'data', 'one', scope: 1
      in1.post new noflo.IP 'closeBracket', 1, scope: 1

  describe 'Process API with IIPs and scopes', ->
    c = null
    in1 = null
    in2 = null
    out = null
    before (done) ->
      fbpData = "
      INPORT=Pc1.IN:IN1
      OUTPORT=PcMerge.OUT:OUT
      Pc1(process/Async) -> IN1 PcMerge(process/Merge)
      'twoIIP' -> IN2 PcMerge(process/Merge)
      "
      noflo.graph.loadFBP fbpData, (err, g) ->
        return done err if err
        loader.registerComponent 'scope', 'MergeIIP', g
        loader.load 'scope/MergeIIP', (err, instance) ->
          return done err if err
          c = instance
          in1 = noflo.internalSocket.createSocket()
          c.inPorts.in1.attach in1
          done()
    beforeEach ->
      out = noflo.internalSocket.createSocket()
      c.outPorts.out.attach out
    afterEach ->
      c.outPorts.out.detach out
      out = null

    it 'should forward scopes as expected', (done) ->
      expected = [
        'x < 1'
        'x DATA 1onePc1:2twoIIP:PcMerge'
        'x >'
      ]
      received = []
      brackets = []

      out.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "#{ip.scope} < #{ip.data}"
            brackets.push ip.data
          when 'data'
            received.push "#{ip.scope} DATA #{ip.data}"
          when 'closeBracket'
            received.push "#{ip.scope} >"
            brackets.pop()
            return if brackets.length
            chai.expect(received).to.eql expected
            done()

      in1.post new noflo.IP 'openBracket', 1, scope: 'x'
      in1.post new noflo.IP 'data', 'one', scope: 'x'
      in1.post new noflo.IP 'closeBracket', 1, scope: 'x'

  describe 'Process API with unscoped inport and scopes', ->
    c = null
    in1 = null
    in2 = null
    out = null
    before (done) ->
      fbpData = "
      INPORT=Pc1.IN:IN1
      INPORT=Pc2.IN:IN2
      OUTPORT=PcMerge.OUT:OUT
      Pc1(process/Async) -> IN1 PcMerge(process/MergeUnscoped)
      Pc2(process/Async) -> IN2 PcMerge(process/MergeUnscoped)
      "
      noflo.graph.loadFBP fbpData, (err, g) ->
        return done err if err
        loader.registerComponent 'scope', 'MergeUnscoped', g
        loader.load 'scope/MergeUnscoped', (err, instance) ->
          return done err if err
          c = instance
          in1 = noflo.internalSocket.createSocket()
          c.inPorts.in1.attach in1
          in2 = noflo.internalSocket.createSocket()
          c.inPorts.in2.attach in2
          done()
    beforeEach ->
      out = noflo.internalSocket.createSocket()
      c.outPorts.out.attach out
    afterEach ->
      c.outPorts.out.detach out
      out = null
    it 'should forward scopes as expected', (done) ->
      expected = [
        'x < 1'
        'x DATA 1onePc1:2twoPc2:PcMerge'
        'x >'
      ]
      received = []
      brackets = []

      out.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "#{ip.scope} < #{ip.data}"
            brackets.push ip.data
          when 'data'
            received.push "#{ip.scope} DATA #{ip.data}"
          when 'closeBracket'
            received.push "#{ip.scope} >"
            brackets.pop()
            return if brackets.length
            chai.expect(received).to.eql expected
            done()

      in1.post new noflo.IP 'openBracket', 1, scope: 'x'
      in1.post new noflo.IP 'data', 'one', scope: 'x'
      in1.post new noflo.IP 'closeBracket', 1, scope: 'x'
      in2.post new noflo.IP 'openBracket', 1, scope: 'x'
      in2.post new noflo.IP 'data', 'two', scope: 'x'
      in2.post new noflo.IP 'closeBracket', 1, scope: 'x'
    it 'should forward packets without scopes', (done) ->
      expected = [
        'null < 1'
        'null DATA 1onePc1:2twoPc2:PcMerge'
        'null >'
      ]
      received = []
      brackets = []

      out.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "#{ip.scope} < #{ip.data}"
            brackets.push ip.data
          when 'data'
            received.push "#{ip.scope} DATA #{ip.data}"
          when 'closeBracket'
            received.push "#{ip.scope} >"
            brackets.pop()
            return if brackets.length
            chai.expect(received).to.eql expected
            done()
      in1.post new noflo.IP 'openBracket', 1
      in1.post new noflo.IP 'data', 'one'
      in1.post new noflo.IP 'closeBracket'
      in2.post new noflo.IP 'openBracket', 1
      in2.post new noflo.IP 'data', 'two'
      in2.post new noflo.IP 'closeBracket', 1
    it 'should forward scopes also on unscoped packet', (done) ->
      expected = [
        'x < 1'
        'x DATA 1onePc1:2twoPc2:PcMerge'
        'x >'
      ]
      received = []
      brackets = []

      out.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "#{ip.scope} < #{ip.data}"
            brackets.push ip.data
          when 'data'
            received.push "#{ip.scope} DATA #{ip.data}"
          when 'closeBracket'
            received.push "#{ip.scope} >"
            brackets.pop()
            return if brackets.length
            chai.expect(received).to.eql expected
            done()
      in2.post new noflo.IP 'openBracket', 1
      in2.post new noflo.IP 'data', 'two'
      in2.post new noflo.IP 'closeBracket', 1
      in1.post new noflo.IP 'openBracket', 1, scope: 'x'
      in1.post new noflo.IP 'data', 'one', scope: 'x'
      in1.post new noflo.IP 'closeBracket', 1, scope: 'x'

  describe 'Process API with unscoped outport and scopes', ->
    c = null
    in1 = null
    in2 = null
    out = null
    before (done) ->
      fbpData = "
      INPORT=Pc1.IN:IN1
      INPORT=Pc2.IN:IN2
      OUTPORT=PcMerge.OUT:OUT
      Pc1(process/Unscope) -> IN1 PcMerge(process/Merge)
      Pc2(process/Unscope) -> IN2 PcMerge
      "
      noflo.graph.loadFBP fbpData, (err, g) ->
        return done err if err
        loader.registerComponent 'scope', 'MergeUnscopedOut', g
        loader.load 'scope/MergeUnscopedOut', (err, instance) ->
          return done err if err
          c = instance
          in1 = noflo.internalSocket.createSocket()
          c.inPorts.in1.attach in1
          in2 = noflo.internalSocket.createSocket()
          c.inPorts.in2.attach in2
          done()
    beforeEach ->
      out = noflo.internalSocket.createSocket()
      c.outPorts.out.attach out
    afterEach ->
      c.outPorts.out.detach out
      out = null
    it 'should remove scopes as expected', (done) ->
      expected = [
        'null < 1'
        'null DATA 1onePc1:2twoPc2:PcMerge'
        'null >'
      ]
      received = []
      brackets = []

      out.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "#{ip.scope} < #{ip.data}"
            brackets.push ip.data
          when 'data'
            received.push "#{ip.scope} DATA #{ip.data}"
          when 'closeBracket'
            received.push "#{ip.scope} >"
            brackets.pop()
            return if brackets.length
            chai.expect(received).to.eql expected
            done()

      in1.post new noflo.IP 'openBracket', 1, scope: 'x'
      in1.post new noflo.IP 'data', 'one', scope: 'x'
      in1.post new noflo.IP 'closeBracket', 1, scope: 'x'
      in2.post new noflo.IP 'openBracket', 1, scope: 'y'
      in2.post new noflo.IP 'data', 'two', scope: 'y'
      in2.post new noflo.IP 'closeBracket', 1, scope: 'y'
    it 'should forward packets without scopes', (done) ->
      expected = [
        'null < 1'
        'null DATA 1onePc1:2twoPc2:PcMerge'
        'null >'
      ]
      received = []
      brackets = []

      out.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "#{ip.scope} < #{ip.data}"
            brackets.push ip.data
          when 'data'
            received.push "#{ip.scope} DATA #{ip.data}"
          when 'closeBracket'
            received.push "#{ip.scope} >"
            brackets.pop()
            return if brackets.length
            chai.expect(received).to.eql expected
            done()
      in1.post new noflo.IP 'openBracket', 1
      in1.post new noflo.IP 'data', 'one'
      in1.post new noflo.IP 'closeBracket'
      in2.post new noflo.IP 'openBracket', 1
      in2.post new noflo.IP 'data', 'two'
      in2.post new noflo.IP 'closeBracket', 1
    it 'should remove scopes also on unscoped packet', (done) ->
      expected = [
        'null < 1'
        'null DATA 1onePc1:2twoPc2:PcMerge'
        'null >'
      ]
      received = []
      brackets = []

      out.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "#{ip.scope} < #{ip.data}"
            brackets.push ip.data
          when 'data'
            received.push "#{ip.scope} DATA #{ip.data}"
          when 'closeBracket'
            received.push "#{ip.scope} >"
            brackets.pop()
            return if brackets.length
            chai.expect(received).to.eql expected
            done()
      in1.post new noflo.IP 'openBracket', 1, scope: 'x'
      in1.post new noflo.IP 'data', 'one', scope: 'x'
      in1.post new noflo.IP 'closeBracket', 1, scope: 'x'
      in2.post new noflo.IP 'openBracket', 1
      in2.post new noflo.IP 'data', 'two'
      in2.post new noflo.IP 'closeBracket', 1

  describe 'Process API with IIPs to addressable ports and scopes', ->
    c = null
    in1 = null
    in2 = null
    out = null
    before (done) ->
      fbpData = "
      INPORT=Pc1.IN:IN1
      OUTPORT=PcMergeA.OUT:OUT
      Pc1(process/Async) -> IN1 PcMergeA(process/MergeA)
      'twoIIP0' -> IN2[0] PcMergeA
      'twoIIP1' -> IN2[1] PcMergeA
      "
      noflo.graph.loadFBP fbpData, (err, g) ->
        return done err if err
        loader.registerComponent 'scope', 'MergeIIPA', g
        loader.load 'scope/MergeIIPA', (err, instance) ->
          return done err if err
          c = instance
          in1 = noflo.internalSocket.createSocket()
          c.inPorts.in1.attach in1
          done()
    beforeEach ->
      out = noflo.internalSocket.createSocket()
      c.outPorts.out.attach out
    afterEach ->
      c.outPorts.out.detach out
      out = null

    it 'should forward scopes as expected', (done) ->
      expected = [
        'x < 1'
        'x DATA 1onePc1:2twoIIP0:2twoIIP1:PcMergeA'
        'x >'
      ]
      received = []
      brackets = []

      out.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "#{ip.scope} < #{ip.data}"
            brackets.push ip.data
          when 'data'
            received.push "#{ip.scope} DATA #{ip.data}"
          when 'closeBracket'
            received.push "#{ip.scope} >"
            brackets.pop()
            return if brackets.length
            chai.expect(received).to.eql expected
            done()

      in1.post new noflo.IP 'openBracket', 1, scope: 'x'
      in1.post new noflo.IP 'data', 'one', scope: 'x'
      in1.post new noflo.IP 'closeBracket', 1, scope: 'x'
