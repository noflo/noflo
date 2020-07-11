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

legacyBasic = ->
  c = new noflo.Component
  c.inPorts.add 'in',
    datatype: 'string'
  c.outPorts.add 'out',
    datatype: 'string'
  c.inPorts.in.on 'connect', ->
    c.outPorts.out.connect()
    return
  c.inPorts.in.on 'begingroup', (group) ->
    c.outPorts.out.beginGroup group
    return
  c.inPorts.in.on 'data', (data) ->
    c.outPorts.out.data data + c.nodeId
    return
  c.inPorts.in.on 'endgroup', (group) ->
    c.outPorts.out.endGroup()
    return
  c.inPorts.in.on 'disconnect', ->
    c.outPorts.out.disconnect()
    return
  return c

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
      return
    , 1
    return
  return c

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
    return
  return c

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
    return
  return c

processBracketize = ->
  c = new noflo.Component
  c.inPorts.add 'in',
    datatype: 'string'
  c.outPorts.add 'out',
    datatype: 'string'
  c.counter = 0
  c.tearDown = (callback) ->
    c.counter = 0
    callback()
    return
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
    return
  return c

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
    return
  return c

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
    return
  c.tearDown = (callback) ->
    cleanUp()
    callback()
    return

  c.process (input, output, context) ->
    if input.hasData 'start'
      cleanUp() if c.timer
      input.getData 'start'
      c.timer = context
      c.timer.interval = setInterval ->
        output.send out: true
        return
      , 100
    if input.hasData 'stop'
      input.getData 'stop'
      unless c.timer
        output.done()
        return
      cleanUp()
      output.done()
      return
    return
  return c

describe 'Network Lifecycle', ->
  loader = null
  before (done) ->
    loader = new noflo.ComponentLoader root
    loader.listComponents (err) ->
      if err
        done err
        return
      loader.registerComponent 'process', 'Async', processAsync
      loader.registerComponent 'process', 'Sync', processSync
      loader.registerComponent 'process', 'Merge', processMerge
      loader.registerComponent 'process', 'Bracketize', processBracketize
      loader.registerComponent 'process', 'NonSending', processNonSending
      loader.registerComponent 'process', 'Generator', processGenerator
      loader.registerComponent 'legacy', 'Sync', legacyBasic
      done()
      return

    return
  describe 'recognizing API level', ->
    it 'should recognize legacy component as such', (done) ->
      loader.load 'legacy/Sync', (err, inst) ->
        if err
          done err
          return
        chai.expect(inst.isLegacy()).to.equal true
        done()
        return
      return
    it 'should recognize Process API component as non-legacy', (done) ->
      loader.load 'process/Async', (err, inst) ->
        if err
          done err
          return
        chai.expect(inst.isLegacy()).to.equal false
        done()
        return
      return
    it 'should recognize Graph component as non-legacy', (done) ->
      loader.load 'Graph', (err, inst) ->
        if err
          done err
          return
        chai.expect(inst.isLegacy()).to.equal false
        done()
        return
      return
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
        if err
          done err
          return
        g = graph
        loader.registerComponent 'scope', 'Connected', graph
        loader.load 'scope/Connected', (err, instance) ->
          if err
            done err
            return
          c = instance
          out = noflo.internalSocket.createSocket()
          c.outPorts.out.attach out
          done()
          return
        return
      return
    afterEach (done) ->
      c.outPorts.out.detach out
      out = null
      c.shutdown done
      return
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
        return
      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
        return
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
        return
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd
      c.start (err) ->
        if err
          done err
          return
        return
      return
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
        return
      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
        return
      checkEnd = ->
        chai.expect(wasStarted).to.equal true
        if received.length < expected.length
          wasStarted = false
          c.network.once 'start', checkStart
          c.network.once 'end', checkEnd
          c.network.addInitial
            from:
              data: 'world'
            to:
              node: 'Pc'
              port: 'in'
           , (err) ->
             if err
              done err
              return
            return
          return
        chai.expect(received).to.eql expected
        done()
        return
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd
      c.start (err) ->
        if err
          done err
          return
        return
      return
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
        return
      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
        return
      checkEnd = ->
        chai.expect(wasStarted).to.equal true
        c.network.stop (err) ->
          if err
            done err
            return
          chai.expect(c.network.isStopped()).to.equal true
          c.network.once 'start', ->
            throw new Error 'Unexpected network start'
            return
          c.network.once 'end', ->
            throw new Error 'Unexpected network end'
            return
          c.network.addInitial
            from:
              data: 'world'
            to:
              node: 'Pc'
              port: 'in'
           , (err) ->
            if err
              done err
              return
            return
          setTimeout ->
            chai.expect(received).to.eql expected
            done()
            return
          , 1000
          return
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd
      c.start (err) ->
        if err
          done err
          return
        return
      return
    return
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
        if err
          done err
          return
        g = graph
        loader.registerComponent 'scope', 'Connected', graph
        loader.load 'scope/Connected', (err, instance) ->
          if err
            done err
            return
          c = instance
          out = noflo.internalSocket.createSocket()
          c.outPorts.out.attach out
          done()
          return
        return
      return
    afterEach (done) ->
      c.outPorts.out.detach out
      out = null
      c.shutdown done
      return
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
        return
      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
        return
      checkEnd = ->
        setTimeout ->
          chai.expect(received).to.eql expected
          chai.expect(wasStarted).to.equal true
          done()
          return
        , 100
        return
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd
      c.start (err) ->
        if err
          done err
          return
        return
      return
    return
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
        if err
          done err
          return
        loader.registerComponent 'scope', 'Merge', g
        loader.load 'scope/Merge', (err, instance) ->
          if err
            done err
            return
          c = instance
          in1 = noflo.internalSocket.createSocket()
          c.inPorts.in1.attach in1
          in2 = noflo.internalSocket.createSocket()
          c.inPorts.in2.attach in2
          done()
          return
        return
      return
    beforeEach ->
      out = noflo.internalSocket.createSocket()
      c.outPorts.out.attach out
      return
    afterEach (done) ->
      c.outPorts.out.detach out
      out = null
      c.shutdown done

      return
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
        return
      out.on 'begingroup', (group) ->
        received.push "< #{group}"
        return
      out.on 'data', (data) ->
        received.push "DATA #{data}"
        return
      out.on 'endgroup', ->
        received.push '>'
        return
      out.on 'disconnect', ->
        received.push 'DISC'
        return

      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
        return
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
        return
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        if err
          done err
          return
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
        return
      return
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
        return
      out.on 'begingroup', (group) ->
        received.push "< #{group}"
        return
      out.on 'data', (data) ->
        received.push "DATA #{data}"
        return
      out.on 'endgroup', ->
        received.push '>'
        return
      out.on 'disconnect', ->
        received.push 'DISC'
        return

      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
        return
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
        return
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        if err
          done err
          return
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
        return
      return
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
        return
      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
        return
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
        return
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        if err
          done err
          return
        in2.post new noflo.IP 'data', 'two',
          scope: 'x'
        in1.post new noflo.IP 'openBracket', 1,
          scope: 'x'
        in1.post new noflo.IP 'data', 'one',
          scope: 'x'
        in1.post new noflo.IP 'closeBracket', 1,
          scope: 'x'
        return
      return
    return
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
        if err
          done err
          return
        loader.registerComponent 'scope', 'Merge', g
        loader.load 'scope/Merge', (err, instance) ->
          if err
            done err
            return
          c = instance
          in1 = noflo.internalSocket.createSocket()
          c.inPorts.in1.attach in1
          in2 = noflo.internalSocket.createSocket()
          c.inPorts.in2.attach in2
          done()
          return
        return
      return
    beforeEach ->
      out = noflo.internalSocket.createSocket()
      c.outPorts.out.attach out
      return
    afterEach (done) ->
      c.outPorts.out.detach out
      out = null
      c.shutdown done

      return
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
        return
      out.on 'begingroup', (group) ->
        received.push "< #{group}"
        return
      out.on 'data', (data) ->
        received.push "DATA #{data}"
        return
      out.on 'endgroup', ->
        received.push '>'
        return
      out.on 'disconnect', ->
        received.push 'DISC'
        return

      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
        return
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
        return
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        if err
          done err
          return
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
        return
      return
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
        return
      out.on 'begingroup', (group) ->
        received.push "< #{group}"
        return
      out.on 'data', (data) ->
        received.push "DATA #{data}"
        return
      out.on 'endgroup', ->
        received.push '>'
        return
      out.on 'disconnect', ->
        received.push 'DISC'
        return

      wasStarted = false
      checkStart = ->
        chai.expect(wasStarted).to.equal false
        wasStarted = true
        return
      checkEnd = ->
        chai.expect(received).to.eql expected
        chai.expect(wasStarted).to.equal true
        done()
        return
      c.network.once 'start', checkStart
      c.network.once 'end', checkEnd

      c.start (err) ->
        if err
          done err
          return
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
        return
      return
    return
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
        if err
          done err
          return
        loader.registerComponent 'scope', 'Connected', g
        loader.load 'scope/Connected', (err, instance) ->
          if err
            done err
            return
          instance.once 'ready', ->
            c = instance
            start = noflo.internalSocket.createSocket()
            c.inPorts.start.attach start
            stop = noflo.internalSocket.createSocket()
            c.inPorts.stop.attach stop
            done()
            return
          return
        return
      return
    beforeEach ->
      out = noflo.internalSocket.createSocket()
      c.outPorts.out.attach out
      return
    afterEach (done) ->
      c.outPorts.out.detach out
      out = null
      c.shutdown done
      return
    it 'should not be running initially', ->
      chai.expect(c.network.isRunning()).to.equal false
      return
    it 'should not be running even when network starts', (done) ->
      c.start (err) ->
        if err
          done err
          return
        chai.expect(c.network.isRunning()).to.equal false
        done()
        return
      return
    it 'should start generating when receiving a start packet', (done) ->
      c.start (err) ->
        if err
          done err
          return
        out.once 'data', ->
          chai.expect(c.network.isRunning()).to.equal true
          done()
          return
        start.send true
        return
      return
    it 'should stop generating when receiving a stop packet', (done) ->
      c.start (err) ->
        if err
          done err
          return
        out.once 'data', ->
          chai.expect(c.network.isRunning()).to.equal true
          stop.send true
          setTimeout ->
            chai.expect(c.network.isRunning()).to.equal false
            done()
            return
          , 10
          return
        start.send true
        return
      return
    return
  return
