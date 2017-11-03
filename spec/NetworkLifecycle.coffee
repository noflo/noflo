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

legacyBasic = ->
  c = new noflo.Component
  c.inPorts.add 'in',
    datatype: 'string'
  c.outPorts.add 'out',
    datatype: 'string'
  c.inPorts.in.on 'connect', ->
    c.outPorts.out.connect()
  c.inPorts.in.on 'begingroup', (group) ->
    c.outPorts.out.beginGroup group
  c.inPorts.in.on 'data', (data) ->
    c.outPorts.out.data data + c.nodeId
  c.inPorts.in.on 'endgroup', (group) ->
    c.outPorts.out.endGroup()
  c.inPorts.in.on 'disconnect', ->
    c.outPorts.out.disconnect()
  c

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

processSync = ->
  c = new noflo.Component
  c.inPorts.add 'in',
    datatype: 'string'
  c.outPorts.add 'out',
    datatype: 'string'
  c.process (input, output) ->
    data = input.getData 'in'
    output.send
      out: data + c.nodeId
    output.done()

processBracketize = ->
  c = new noflo.Component
  c.inPorts.add 'in',
    datatype: 'string'
  c.outPorts.add 'out',
    datatype: 'string'
  c.counter = 0
  c.tearDown = (callback) ->
    c.counter = 0
    do callback
  c.process (input, output) ->
    data = input.getData 'in'
    output.send
      out: new noflo.IP 'openBracket', c.counter
    output.send
      out: data
    output.send
      out: new noflo.IP 'closeBracket', c.counter
    c.counter++
    output.done()

processNonSending = ->
  c = new noflo.Component
  c.inPorts.add 'in',
    datatype: 'string'
  c.inPorts.add 'in2',
    datatype: 'string'
  c.outPorts.add 'out',
    datatype: 'string'
  c.forwardBrackets = {}
  c.process (input, output) ->
    if input.hasData 'in2'
      input.getData 'in2'
      output.done()
      return
    return unless input.hasData 'in'
    data = input.getData 'in'
    output.send data + c.nodeId
    output.done()

processGenerator = ->
  c = new noflo.Component
  c.inPorts.add 'start',
    datatype: 'bang'
  c.inPorts.add 'stop',
    datatype: 'bang'
  c.outPorts.add 'out',
    datatype: 'bang'
  c.autoOrdering = false

  cleanUp = ->
    return unless c.timer
    clearInterval c.timer.interval
    c.timer.deactivate()
    c.timer = null
  c.tearDown = (callback) ->
    cleanUp()
    callback()

  c.process (input, output, context) ->
    if input.hasData 'start'
      cleanUp() if c.timer
      input.getData 'start'
      c.timer = context
      c.timer.interval = setInterval ->
        output.send out: true
      , 100
    if input.hasData 'stop'
      input.getData 'stop'
      return output.done() unless c.timer
      cleanUp()
      output.done()

describe 'Network Lifecycle', ->
  loader = null
  before (done) ->
    loader = new noflo.ComponentLoader root
    loader.listComponents (err) ->
      return done err if err
      loader.registerComponent 'wirepattern', 'Async', wirePatternAsync
      loader.registerComponent 'wirepattern', 'Merge', wirePatternMerge
      loader.registerComponent 'process', 'Async', processAsync
      loader.registerComponent 'process', 'Sync', processSync
      loader.registerComponent 'process', 'Merge', processMerge
      loader.registerComponent 'process', 'Bracketize', processBracketize
      loader.registerComponent 'process', 'NonSending', processNonSending
      loader.registerComponent 'process', 'Generator', processGenerator
      loader.registerComponent 'legacy', 'Sync', legacyBasic
      done()

  describe 'recognizing API level', ->
    it 'should recognize legacy component as such', (done) ->
      loader.load 'legacy/Sync', (err, inst) ->
        return done err if err
        chai.expect(inst.isLegacy()).to.equal true
        done()
      return
    it 'should recognize WirePattern component as non-legacy', (done) ->
      loader.load 'wirepattern/Async', (err, inst) ->
        return done err if err
        chai.expect(inst.isLegacy()).to.equal false
        done()
      return
    it 'should recognize Process API component as non-legacy', (done) ->
      loader.load 'process/Async', (err, inst) ->
        return done err if err
        chai.expect(inst.isLegacy()).to.equal false
        done()
      return
    it 'should recognize Graph component as non-legacy', (done) ->
      loader.load 'Graph', (err, inst) ->
        return done err if err
        chai.expect(inst.isLegacy()).to.equal false
        done()
      return

  describe 'with single Process API component receiving IIP', ->
    c = null
    g = null
    out = null
    beforeEach (done) ->
      fbpData = "
      OUTPORT=Pc.OUT:OUT
      'hello' -> IN Pc(process/Async)
      "
      noflo.graph.loadFBP fbpData, (err, graph) ->
        return done err if err
        g = graph
        loader.registerComponent 'scope', 'Connected', graph
        loader.load 'scope/Connected', (err, instance) ->
          return done err if err
          c = instance
          out = noflo.internalSocket.createSocket()
          c.outPorts.out.attach out
          done()
    afterEach (done) ->
      c.outPorts.out.detach out
      out = null
      c.shutdown done
    it 'should execute and finish', (done) ->
      expected = [
        'DATA helloPc'
      ]
      received = []
      out.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "< #{ip.data}"
          when 'data'
            received.push "DATA #{ip.data}"
          when 'closeBracket'
            received.push '>'
      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd
      c.start (err) ->
        return done err if err
    it 'should execute twice if IIP changes', (done) ->
      expected = [
        'DATA helloPc'
        'DATA worldPc'
      ]
      received = []
      out.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "< #{ip.data}"
          when 'data'
            received.push "DATA #{ip.data}"
          when 'closeBracket'
            received.push '>'
      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
      checkEnd = ->
        chai.expect(wasStarted).to.equal true
        if received.length < expected.length
          wasStarted = false
          c.network.once 'start', checkStart
          c.network.once 'end', checkEnd
          g.addInitial 'world', 'Pc', 'in'
          return
        chai.expect(received).to.eql expected
        done()
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd
      c.start (err) ->
        return done err if err
    it 'should not send new IIP if network was stopped', (done) ->
      expected = [
        'DATA helloPc'
      ]
      received = []
      out.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "< #{ip.data}"
          when 'data'
            received.push "DATA #{ip.data}"
          when 'closeBracket'
            received.push '>'
      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
      checkEnd = ->
        chai.expect(wasStarted).to.equal true
        c.network.stop (err) ->
          return done err if err
          chai.expect(c.network.isStopped()).to.equal true
          c.network.once 'start', ->
            throw new Error 'Unexpected network start'
          c.network.once 'end', ->
            throw new Error 'Unexpected network end'
          g.addInitial 'world', 'Pc', 'in'
          setTimeout ->
            chai.expect(received).to.eql expected
            done()
          , 1000
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd
      c.start (err) ->
        return done err if err

  describe 'with synchronous Process API', ->
    c = null
    g = null
    out = null
    beforeEach (done) ->
      fbpData = "
      OUTPORT=Sync.OUT:OUT
      'foo' -> IN2 NonSending(process/NonSending)
      'hello' -> IN Bracketize(process/Bracketize)
      Bracketize OUT -> IN NonSending(process/NonSending)
      NonSending OUT -> IN Sync(process/Sync)
      Sync OUT -> IN2 NonSending
      "
      noflo.graph.loadFBP fbpData, (err, graph) ->
        return done err if err
        g = graph
        loader.registerComponent 'scope', 'Connected', graph
        loader.load 'scope/Connected', (err, instance) ->
          return done err if err
          c = instance
          out = noflo.internalSocket.createSocket()
          c.outPorts.out.attach out
          done()
    afterEach (done) ->
      c.outPorts.out.detach out
      out = null
      c.shutdown done
    it 'should execute and finish', (done) ->
      expected = [
        'DATA helloNonSendingSync'
      ]
      received = []
      out.on 'ip', (ip) ->
        switch ip.type
          when 'openBracket'
            received.push "< #{ip.data}"
          when 'data'
            received.push "DATA #{ip.data}"
          when 'closeBracket'
            received.push '>'
      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
      checkEnd = ->
        setTimeout ->
          chai.expect(received).to.eql expected
          chai.expect(wasStarted).to.equal true
          done()
        , 100
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd
      c.start (err) ->
        return done err if err

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
    afterEach (done) ->
      c.outPorts.out.detach out
      out = null
      c.shutdown done

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

      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        return done err if err
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

      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        return done err if err
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

      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        return done err if err
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
    afterEach (done) ->
      c.outPorts.out.detach out
      out = null
      c.shutdown done

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

      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        return done err if err
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

      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        return done err if err
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

      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        return done err if err
        in2.post new noflo.IP 'data', 'two',
          scope: 'x'
        in1.post new noflo.IP 'openBracket', 1,
          scope: 'x'
        in1.post new noflo.IP 'data', 'one',
          scope: 'x'
        in1.post new noflo.IP 'closeBracket', 1,
          scope: 'x'

  describe 'Process API mixed with legacy merging two inputs', ->
    c = null
    in1 = null
    in2 = null
    out = null
    before (done) ->
      fbpData = "
      INPORT=Leg1.IN:IN1
      INPORT=Leg2.IN:IN2
      OUTPORT=Leg3.OUT:OUT
      Leg1(legacy/Sync) OUT -> IN1 PcMerge(process/Merge)
      Leg2(legacy/Sync) OUT -> IN2 PcMerge(process/Merge)
      PcMerge OUT -> IN Leg3(legacy/Sync)
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
    afterEach (done) ->
      c.outPorts.out.detach out
      out = null
      c.shutdown done

    it 'should forward new-style brackets as expected', (done) ->
      expected = [
        'CONN'
        '< 1'
        '< a'
        'DATA 1bazLeg1:2fooLeg2:PcMergeLeg3'
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

      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        return done err if err
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
        'DATA 1bazLeg1:2fooLeg2:PcMergeLeg3'
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

      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        return done err if err
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

  describe 'Process API mixed with Legacy and WirePattern merging two inputs', ->
    c = null
    in1 = null
    in2 = null
    out = null
    before (done) ->
      fbpData = "
      INPORT=Leg1.IN:IN1
      INPORT=Leg2.IN:IN2
      OUTPORT=Wp.OUT:OUT
      Leg1(legacy/Sync) OUT -> IN1 PcMerge(process/Merge)
      Leg2(legacy/Sync) OUT -> IN2 PcMerge(process/Merge)
      PcMerge OUT -> IN Wp(wirepattern/Async)
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
    afterEach (done) ->
      c.outPorts.out.detach out
      out = null
      c.shutdown done

    it 'should forward new-style brackets as expected', (done) ->
      expected = [
        'CONN'
        '< 1'
        '< a'
        'DATA 1bazLeg1:2fooLeg2:PcMergeWp'
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

      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        return done err if err
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
        'DATA 1bazLeg1:2fooLeg2:PcMergeWp'
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

      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        return done err if err
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

  describe 'Process API mixed with WirePattern and legacy merging two inputs', ->
    c = null
    in1 = null
    in2 = null
    out = null
    before (done) ->
      fbpData = "
      INPORT=Leg1.IN:IN1
      INPORT=Leg2.IN:IN2
      OUTPORT=Leg3.OUT:OUT
      Leg1(legacy/Sync) OUT -> IN1 PcMerge(process/Merge)
      Leg2(legacy/Sync) OUT -> IN2 PcMerge(process/Merge)
      PcMerge OUT -> IN Wp(wirepattern/Async)
      Wp OUT -> IN Leg3(legacy/Sync)
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
    afterEach (done) ->
      c.outPorts.out.detach out
      out = null
      c.shutdown done

    it 'should forward new-style brackets as expected', (done) ->
      expected = [
        'START'
        'DATA -> IN Leg2() DATA foo'
        'Leg2() OUT -> IN2 PcMerge() DATA fooLeg2'
        'Leg1() OUT -> IN1 PcMerge() < 1'
        'Leg1() OUT -> IN1 PcMerge() < a'
        'Leg1() OUT -> IN1 PcMerge() DATA bazLeg1'
        'PcMerge() OUT -> IN Wp() < 1'
        'PcMerge() OUT -> IN Wp() < a'
        'PcMerge() OUT -> IN Wp() DATA 1bazLeg1:2fooLeg2:PcMerge'
        'Leg1() OUT -> IN1 PcMerge() > a'
        'PcMerge() OUT -> IN Wp() > a'
        'Leg1() OUT -> IN1 PcMerge() > 1'
        'PcMerge() OUT -> IN Wp() > 1'
        'Wp() OUT -> IN Leg3() < 1'
        'Wp() OUT -> IN Leg3() < a'
        'Wp() OUT -> IN Leg3() DATA 1bazLeg1:2fooLeg2:PcMergeWp'
        'Wp() OUT -> IN Leg3() > a'
        'Wp() OUT -> IN Leg3() > 1'
        'END'
      ]
      received = []

      wasStarted = false
      checkStart = ->
        received.push 'START'
      receiveConnect = (event) ->
        received.push "#{event.id} CONN"
      receiveEvent = (event) ->
        prefix = ''
        switch event.type
          when 'openBracket'
            prefix = '<'
            data = "#{prefix} #{event.data}"
          when 'data'
            prefix = 'DATA'
            data = "#{prefix} #{event.data}"
          when 'closeBracket'
            prefix = '>'
            data = "#{prefix} #{event.data}"
        received.push "#{event.id} #{data}"
      receiveDisconnect = (event) ->
        received.push "#{event.id} DISC"
      checkEnd = ->
        received.push 'END'
        c.network.graph.removeInitial 'foo', 'Leg2', 'in'
        c.network.removeListener 'connect', receiveConnect
        c.network.removeListener 'ip', receiveEvent
        c.network.removeListener 'disconnect', receiveDisconnect
        chai.expect(received).to.eql expected
        done()
      c.network.once 'start', checkStart
      c.network.on 'connect', receiveConnect
      c.network.on 'ip', receiveEvent
      c.network.on 'disconnect', receiveDisconnect
      c.network.once 'end', checkEnd

      c.network.graph.addInitial 'foo', 'Leg2', 'in'
      c.start (err) ->
        return done err if err
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
        'DATA 1bazLeg1:2fooLeg2:PcMergeWpLeg3'
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

      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        return done err if err
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

  describe 'with a Process API Generator component', ->
    c = null
    start = null
    stop = null
    out = null
    before (done) ->
      fbpData = "
      INPORT=PcGen.START:START
      INPORT=PcGen.STOP:STOP
      OUTPORT=Pc.OUT:OUT
      PcGen(process/Generator) OUT -> IN Pc(process/Async)
      "
      noflo.graph.loadFBP fbpData, (err, g) ->
        return done err if err
        loader.registerComponent 'scope', 'Connected', g
        loader.load 'scope/Connected', (err, instance) ->
          return done err if err
          instance.once 'ready', ->
            c = instance
            start = noflo.internalSocket.createSocket()
            c.inPorts.start.attach start
            stop = noflo.internalSocket.createSocket()
            c.inPorts.stop.attach stop
            done()
    beforeEach ->
      out = noflo.internalSocket.createSocket()
      c.outPorts.out.attach out
    afterEach (done) ->
      c.outPorts.out.detach out
      out = null
      c.shutdown done
    it 'should not be running initially', ->
      chai.expect(c.network.isRunning()).to.equal false
    it 'should not be running even when network starts', (done) ->
      c.start (err) ->
        return done err if err
        chai.expect(c.network.isRunning()).to.equal false
        done()
    it 'should start generating when receiving a start packet', (done) ->
      c.start (err) ->
        return done err if err
        out.once 'data', ->
          chai.expect(c.network.isRunning()).to.equal true
          done()
        start.send true
    it 'should stop generating when receiving a stop packet', (done) ->
      c.start (err) ->
        return done err if err
        out.once 'data', ->
          chai.expect(c.network.isRunning()).to.equal true
          stop.send true
          setTimeout ->
            chai.expect(c.network.isRunning()).to.equal false
            done()
          , 10
        start.send true
