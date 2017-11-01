if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo.coffee'
else
  noflo = require 'noflo'

describe 'Component traits', ->
  describe 'WirePattern', ->
    describe 'when grouping by packet groups', ->
      c = null
      x = null
      y = null
      z = null
      p = null
      beforeEach (done) ->
        c = new noflo.Component
        c.inPorts.add 'x',
          required: true
          datatype: 'int'
        .add 'y',
          required: true
          datatype: 'int'
        .add 'z',
          required: true
          datatype: 'int'
        c.outPorts.add 'point'
        x = new noflo.internalSocket.createSocket()
        y = new noflo.internalSocket.createSocket()
        z = new noflo.internalSocket.createSocket()
        p = new noflo.internalSocket.createSocket()
        c.inPorts.x.attach x
        c.inPorts.y.attach y
        c.inPorts.z.attach z
        c.outPorts.point.attach p
        done()
      afterEach ->
        c.outPorts.point.detach p

      it 'should pass data and groups to the callback', (done) ->
        src =
          111: {x: 1, y: 2, z: 3}
          222: {x: 4, y: 5, z: 6}
          333: {x: 7, y: 8, z: 9}
        noflo.helpers.WirePattern c,
          in: ['x', 'y', 'z']
          out: 'point'
          group: true
          forwardGroups: true
          async: true
        , (data, groups, out, callback) ->
          chai.expect(groups.length).to.be.above 0
          chai.expect(data).to.deep.equal src[groups[0]]
          out.send data
          do callback

        groups = []
        count = 0
        p.on 'begingroup', (grp) ->
          groups.push grp
        p.on 'endgroup', ->
          groups.pop()
        p.on 'data', (data) ->
          count++
        p.on 'disconnect', ->
          done() if count is 3 and groups.length is 0

        for key, grp of src
          x.beginGroup key
          y.beginGroup key
          z.beginGroup key
          x.send grp.x
          y.send grp.y
          z.send grp.z
          x.endGroup()
          y.endGroup()
          z.endGroup()
          x.disconnect()
          y.disconnect()
          z.disconnect()

      it 'should work without a group provided', (done) ->
        noflo.helpers.WirePattern c,
          in: ['x', 'y', 'z']
          out: 'point'
          async: true
        , (data, groups, out, callback) ->
          chai.expect(groups.length).to.equal 0
          out.send {x: data.x, y: data.y, z: data.z}
          do callback

        p.once 'data', (data) ->
          chai.expect(data).to.deep.equal {x: 123, y: 456, z: 789}
          done()

        x.send 123
        x.disconnect()
        y.send 456
        y.disconnect()
        z.send 789
        z.disconnect()

      it 'should process inputs for different groups independently with group: true', (done) ->
        src =
          1: {x: 1, y: 2, z: 3}
          2: {x: 4, y: 5, z: 6}
          3: {x: 7, y: 8, z: 9}
        inOrder = [
          [ 1, 'x' ]
          [ 3, 'z' ]
          [ 2, 'y' ]
          [ 2, 'x' ]
          [ 1, 'z' ]
          [ 2, 'z' ]
          [ 3, 'x' ]
          [ 1, 'y' ]
          [ 3, 'y' ]
        ]
        outOrder = [ 2, 1, 3 ]

        noflo.helpers.WirePattern c,
          in: ['x', 'y', 'z']
          out: 'point'
          group: true
          forwardGroups: true
          async: true
        , (data, groups, out, callback) ->
          out.send {x: data.x, y: data.y, z: data.z}
          do callback

        groups = []

        p.on 'begingroup', (grp) ->
          groups.push grp
        p.on 'endgroup', (grp) ->
          groups.pop()
        p.on 'data', (data) ->
          chai.expect(groups.length).to.equal 1
          chai.expect(groups[0]).to.equal outOrder[0]
          chai.expect(data).to.deep.equal src[outOrder[0]]
          outOrder.shift()
          done() unless outOrder.length

        for tuple in inOrder
          input = null
          switch tuple[1]
            when 'x'
              input = x
            when 'y'
              input = y
            when 'z'
              input = z
          input.beginGroup tuple[0]
          input.send src[tuple[0]][tuple[1]]
          input.endGroup()
          input.disconnect()

      it 'should support asynchronous handlers', (done) ->
        point =
          x: 123
          y: 456
          z: 789

        noflo.helpers.WirePattern c,
          in: ['x', 'y', 'z']
          out: 'point'
          async: true
          group: true
          forwardGroups: true
        , (data, groups, out, callback) ->
          setTimeout ->
            out.send {x: data.x, y: data.y, z: data.z}
            callback()
          , 100

        counter = 0
        hadData = false
        p.on 'begingroup', (grp) ->
          counter++
        p.on 'endgroup', ->
          counter--
        p.once 'data', (data) ->
          chai.expect(data).to.deep.equal point
          hadData = true
        p.once 'disconnect', ->
          chai.expect(counter).to.equal 0
          chai.expect(hadData).to.be.true
          done()

        x.beginGroup 'async'
        y.beginGroup 'async'
        z.beginGroup 'async'
        x.send point.x
        y.send point.y
        z.send point.z
        x.endGroup()
        y.endGroup()
        z.endGroup()
        x.disconnect()
        y.disconnect()
        z.disconnect()

      it 'should not forward groups if forwarding is off', (done) ->
        point =
          x: 123
          y: 456
        noflo.helpers.WirePattern c,
          in: ['x', 'y']
          out: 'point'
          async: true
        , (data, groups, out, callback) ->
          out.send { x: data.x, y: data.y }
          do callback

        counter = 0
        hadData = false
        p.on 'begingroup', (grp) ->
          counter++
        p.on 'data', (data) ->
          chai.expect(data).to.deep.equal point
          hadData = true
        p.once 'disconnect', ->
          chai.expect(counter).to.equal 0
          chai.expect(hadData).to.be.true
          done()

        x.beginGroup 'doNotForwardMe'
        y.beginGroup 'doNotForwardMe'
        x.send point.x
        y.send point.y
        x.endGroup()
        y.endGroup()
        x.disconnect()
        y.disconnect()

      it 'should forward groups from a specific port only', (done) ->
        point =
          x: 123
          y: 456
          z: 789
        refGroups = ['boo']
        noflo.helpers.WirePattern c,
          in: ['x', 'y', 'z']
          out: 'point'
          forwardGroups: 'y'
          async: true
        , (data, groups, out, callback) ->
          out.send { x: data.x, y: data.y, z: data.z }
          do callback

        groups = []
        p.on 'begingroup', (grp) ->
          groups.push grp
        p.on 'data', (data) ->
          chai.expect(data).to.deep.equal point
        p.once 'disconnect', ->
          chai.expect(groups).to.deep.equal refGroups
          done()

        x.beginGroup 'foo'
        y.beginGroup 'boo'
        z.beginGroup 'bar'
        x.send point.x
        y.send point.y
        z.send point.z
        x.endGroup()
        y.endGroup()
        z.endGroup()
        x.disconnect()
        y.disconnect()
        z.disconnect()

      it 'should forward groups from selected ports only', (done) ->
        point =
          x: 123
          y: 456
          z: 789
        refGroups = ['foo', 'bar']
        noflo.helpers.WirePattern c,
          in: ['x', 'y', 'z']
          out: 'point'
          forwardGroups: [ 'x', 'z' ]
          async: true
        , (data, groups, out, callback) ->
          out.send { x: data.x, y: data.y, z: data.z }
          do callback

        groups = []
        p.on 'begingroup', (grp) ->
          groups.push grp
        p.on 'data', (data) ->
          chai.expect(data).to.deep.equal point
        p.once 'disconnect', ->
          chai.expect(groups).to.deep.equal refGroups
          done()

        x.beginGroup 'foo'
        y.beginGroup 'boo'
        z.beginGroup 'bar'
        x.send point.x
        y.send point.y
        z.send point.z
        x.endGroup()
        y.endGroup()
        z.endGroup()
        x.disconnect()
        y.disconnect()
        z.disconnect()

    describe 'when `this` context is important', ->
      c = new noflo.Component
      c.inPorts.add 'x',
        required: true
        datatype: 'int'
      .add 'y',
        required: true
        datatype: 'int'
      .add 'z',
        required: true
        datatype: 'int'
      c.outPorts.add 'point'
      x = new noflo.internalSocket.createSocket()
      y = new noflo.internalSocket.createSocket()
      z = new noflo.internalSocket.createSocket()
      p = new noflo.internalSocket.createSocket()
      c.inPorts.x.attach x
      c.inPorts.y.attach y
      c.inPorts.z.attach z
      c.outPorts.point.attach p

      it 'should correctly bind component to `this` context', (done) ->
        noflo.helpers.WirePattern c,
          in: ['x', 'y', 'z']
          async: true
          out: 'point'
        , (data, groups, out, callback) ->
          chai.expect(this).to.deep.equal c
          out.send {x: data.x, y: data.y, z: data.z}
          callback()

        p.once 'data', (data) ->
          done()

        x.send 123
        x.disconnect()
        y.send 456
        y.disconnect()
        z.send 789
        z.disconnect()

    describe 'when packet order matters', ->
      c = new noflo.Component
      c.inPorts.add 'delay', datatype: 'int'
      .add 'msg', datatype: 'string'
      c.outPorts.add 'out', datatype: 'object'
      .add 'load', datatype: 'int'
      delay = new noflo.internalSocket.createSocket()
      msg = new noflo.internalSocket.createSocket()
      out = new noflo.internalSocket.createSocket()
      load = new noflo.internalSocket.createSocket()
      c.inPorts.delay.attach delay
      c.inPorts.msg.attach msg
      c.outPorts.out.attach out
      c.outPorts.load.attach load

      it 'should preserve input order at the output', (done) ->
        noflo.helpers.WirePattern c,
          in: ['delay', 'msg']
          async: true
          ordered: true
          group: false
        , (data, groups, res, callback) ->
          setTimeout ->
            res.send { delay: data.delay, msg: data.msg }
            callback()
          , data.delay

        sample = [
          { delay: 30, msg: "one" }
          { delay: 0, msg: "two" }
          { delay: 20, msg: "three" }
          { delay: 10, msg: "four" }
        ]

        out.on 'data', (data) ->
          chai.expect(data).to.deep.equal sample.shift()
        out.on 'disconnect', ->
          done() if sample.length is 0

        expected = [1, 2, 3, 4, 3, 2, 1, 0]
        load.on 'data', (data) ->
          chai.expect(data).to.equal expected.shift()

        idx = 0
        for ip in sample
          delay.beginGroup idx
          delay.send ip.delay
          delay.endGroup()
          msg.beginGroup idx
          msg.send ip.msg
          msg.endGroup()
          delay.disconnect()
          msg.disconnect()
          idx++

      it 'should throw if sync mode is used', (done) ->
        f = ->
          noflo.helpers.WirePattern c,
            in: ['delay', 'msg']
          , (data, groups, res) ->

        chai.expect(f).to.throw Error
        done()

      it 'should throw if async callback doesn\'t have needed amount of arguments', (done) ->
        f = ->
          noflo.helpers.WirePattern c,
            in: ['delay', 'msg']
            async: true
          , (data, groups, res) ->

        chai.expect(f).to.throw Error
        done()

      it 'should throw if receiveStreams is used', (done) ->
        f = ->
          noflo.helpers.WirePattern c,
            in: ['delay', 'msg']
            async: true
            ordered: true
            group: false
            receiveStreams: ['delay', 'msg']
          , (data, groups, res, callback) ->
            callback()

        chai.expect(f).to.throw Error
        done()

      it 'should throw if sendStreams is used', (done) ->
        f = ->
          noflo.helpers.WirePattern c,
            in: ['delay', 'msg']
            async: true
            ordered: true
            group: false
            sendStreams: ['out']
          , (data, groups, res, callback) ->
            callback()

        chai.expect(f).to.throw Error
        done()

      # it 'should support complex substreams', (done) ->
      #   out.removeAllListeners()
      #   load.removeAllListeners()
      #   c.cntr = 0
      #   helpers.WirePattern c,
      #     in: ['delay', 'msg']
      #     async: true
      #     ordered: true
      #     group: false
      #     receiveStreams: ['delay', 'msg']
      #   , (data, groups, res, callback) ->
      #     # Substream to object conversion validation
      #     # (the hard way)
      #     chai.expect(data.delay instanceof Substream).to.be.true
      #     chai.expect(data.msg instanceof Substream).to.be.true
      #     delayObj = data.delay.toObject()
      #     msgObj = data.msg.toObject()
      #     index0 = this.cntr.toString()
      #     chai.expect(Object.keys(delayObj)[0]).to.equal index0
      #     chai.expect(Object.keys(msgObj)[0]).to.equal index0
      #     subDelay = delayObj[index0]
      #     subMsg = msgObj[index0]
      #     index1 = (10 + this.cntr).toString()
      #     chai.expect(Object.keys(subDelay)[0]).to.equal index1
      #     chai.expect(Object.keys(subMsg)[0]).to.equal index1
      #     delayData = subDelay[index1]
      #     msgData = subMsg[index1]
      #     chai.expect(delayData).to.equal sample[c.cntr].delay
      #     chai.expect(msgData).to.equal sample[c.cntr].msg
      #     this.cntr++

      #     setTimeout ->
      #       # Substream tree traversal (the easy way)
      #       for k0, v0 of msgObj
      #         res.beginGroup k0
      #         res.send k0
      #         for k1, v1 of v0
      #           res.beginGroup k1
      #           res.send
      #             delay: delayObj[k0][k1]
      #             msg: msgObj[k0][k1]
      #           res.endGroup()
      #           res.send k1
      #         res.endGroup()
      #       callback()
      #     , data.delay

      #   sample = [
      #     { delay: 30, msg: "one" }
      #     { delay: 0, msg: "two" }
      #     { delay: 20, msg: "three" }
      #     { delay: 10, msg: "four" }
      #   ]

      #   expected = [
      #     '0', '0', '10', sample[0], '10'
      #     '1', '1', '11', sample[1], '11'
      #     '2', '2', '12', sample[2], '12'
      #     '3', '3', '13', sample[3], '13'
      #   ]

      #   out.on 'begingroup', (grp) ->
      #     chai.expect(grp).to.equal expected.shift()
      #   out.on 'data', (data) ->
      #     chai.expect(data).to.deep.equal expected.shift()
      #   out.on 'disconnect', ->
      #     done() if expected.length is 0

      #   for i in [0..3]
      #     delay.beginGroup i
      #     delay.beginGroup 10 + i
      #     delay.send sample[i].delay
      #     delay.endGroup()
      #     delay.endGroup()
      #     msg.beginGroup i
      #     msg.beginGroup 10 + i
      #     msg.send sample[i].msg
      #     msg.endGroup()
      #     msg.endGroup()
      #     delay.disconnect()
      #     msg.disconnect()

    describe 'when grouping by field', ->
      c = new noflo.Component
      c.inPorts.add 'user', datatype: 'object'
      .add 'message', datatype: 'object'
      c.outPorts.add 'signedmessage'
      usr = new noflo.internalSocket.createSocket()
      msg = new noflo.internalSocket.createSocket()
      umsg = new noflo.internalSocket.createSocket()
      c.inPorts.user.attach usr
      c.inPorts.message.attach msg
      c.outPorts.signedmessage.attach umsg

      it 'should match objects by specific field', (done) ->
        noflo.helpers.WirePattern c,
          in: ['user', 'message']
          out: 'signedmessage'
          async: true
          field: 'request'
        , (data, groups, out, callback) ->
          setTimeout ->
            out.send
              request: data.request
              user: data.user.name
              text: data.message.text
            callback()
          , 10

        users =
          14: {request: 14, id: 21, name: 'Josh'}
          12: {request: 12, id: 25, name: 'Leo'}
          34: {request: 34, id: 84, name: 'Anica'}
        messages =
          34: {request: 34, id: 234, text: 'Hello world'}
          12: {request: 12, id: 82, text: 'Aloha amigos'}
          14: {request: 14, id: 249, text: 'Node.js ftw'}

        counter = 0
        umsg.on 'data', (data) ->
          chai.expect(data).to.be.an 'object'
          chai.expect(data.request).to.be.ok
          chai.expect(data.user).to.equal users[data.request].name
          chai.expect(data.text).to.equal messages[data.request].text
          counter++
          done() if counter is 3

        # Send input asynchronously with mixed delays
        for req, user of users
          do (req, user) ->
            setTimeout ->
              usr.send user
              usr.disconnect()
            , req
        for req, mesg of messages
          do (req, mesg) ->
            setTimeout ->
              msg.send mesg
              msg.disconnect()
            , req

    describe 'when there are multiple output routes', ->
      it 'should send output to one or more of them', (done) ->
        numbers = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']
        c = new noflo.Component
        c.inPorts.add 'num', datatype: 'int'
        .add 'str', datatype: 'string'
        c.outPorts.add 'odd', datatype: 'object'
        .add 'even', datatype: 'object'
        num = new noflo.internalSocket.createSocket()
        str = new noflo.internalSocket.createSocket()
        odd = new noflo.internalSocket.createSocket()
        even = new noflo.internalSocket.createSocket()
        c.inPorts.num.attach num
        c.inPorts.str.attach str
        c.outPorts.odd.attach odd
        c.outPorts.even.attach even

        noflo.helpers.WirePattern c,
          in: ['num', 'str']
          out: ['odd', 'even']
          async: true
          ordered: true
          forwardGroups: true
        , (data, groups, outs, callback) ->
          setTimeout ->
            if data.num % 2 is 1
              outs.odd.send data
            else
              outs.even.send data
            callback()
          , 0

        expected = []
        numbers.forEach (n, idx) ->
          if idx % 2 is 1
            port = 'odd'
          else
            port = 'even'
          expected.push "#{port} < #{idx}"
          expected.push "#{port} DATA #{n}"
          expected.push "#{port} > #{idx}"
        received = []
        odd.on 'begingroup', (grp) ->
          received.push "odd < #{grp}"
        odd.on 'data', (data) ->
          received.push "odd DATA #{data.str}"
        odd.on 'endgroup', (grp) ->
          received.push "odd > #{grp}"
        odd.on 'disconnect', ->
          return unless received.length is expected.length
          chai.expect(received).to.eql expected
          done()
        even.on 'begingroup', (grp) ->
          received.push "even < #{grp}"
        even.on 'data', (data) ->
          received.push "even DATA #{data.str}"
        even.on 'endgroup', (grp) ->
          received.push "even > #{grp}"
        even.on 'disconnect', ->
          return unless received.length >= expected.length
          chai.expect(received).to.eql expected
          done()

        for i in [0...10]
          num.beginGroup i
          num.send i
          num.endGroup i
          num.disconnect()
          str.beginGroup i
          str.send numbers[i]
          str.endGroup i
          str.disconnect()

      it 'should send output to one or more of indexes', (done) ->
        c = new noflo.Component
        c.inPorts.add 'num', datatype: 'int'
        .add 'str', datatype: 'string'
        c.outPorts.add 'out',
          datatype: 'object'
          addressable: true
        num = new noflo.internalSocket.createSocket()
        str = new noflo.internalSocket.createSocket()
        odd = new noflo.internalSocket.createSocket()
        even = new noflo.internalSocket.createSocket()
        c.inPorts.num.attach num
        c.inPorts.str.attach str
        c.outPorts.out.attach odd
        c.outPorts.out.attach even
        numbers = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']

        noflo.helpers.WirePattern c,
          in: ['num', 'str']
          out: 'out'
          async: true
          ordered: true
          forwardGroups: true
        , (data, groups, outs, callback) ->
          setTimeout ->
            if data.num % 2 is 1
              outs.send data, 0
            else
              outs.send data, 1
            callback()
          , 0

        expected = []
        numbers.forEach (n, idx) ->
          if idx % 2 is 1
            port = 'odd'
          else
            port = 'even'
          expected.push "#{port} < #{idx}"
          expected.push "#{port} DATA #{n}"
          expected.push "#{port} > #{idx}"
        received = []
        odd.on 'begingroup', (grp) ->
          received.push "odd < #{grp}"
        odd.on 'data', (data) ->
          received.push "odd DATA #{data.str}"
        odd.on 'endgroup', (grp) ->
          received.push "odd > #{grp}"
        odd.on 'disconnect', ->
          return unless received.length is expected.length
          chai.expect(received).to.eql expected
          done()
        even.on 'begingroup', (grp) ->
          received.push "even < #{grp}"
        even.on 'data', (data) ->
          received.push "even DATA #{data.str}"
        even.on 'endgroup', (grp) ->
          received.push "even > #{grp}"
        even.on 'disconnect', ->
          return unless received.length >= expected.length
          chai.expect(received).to.eql expected
          done()

        for i in [0...10]
          num.beginGroup i
          num.send i
          num.endGroup i
          num.disconnect()
          str.beginGroup i
          str.send numbers[i]
          str.endGroup i
          str.disconnect()

    describe 'when there are parameter ports', ->
      c = null
      p1 = p2 = p3 = d1 = d2 = out = err = 0
      beforeEach ->
        c = new noflo.Component
        c.inPorts.add 'param1',
          datatype: 'string'
          required: true
        .add 'param2',
          datatype: 'int'
          required: false
        .add 'param3',
          datatype: 'int'
          required: true
          default: 0
        .add 'data1',
          datatype: 'string'
        .add 'data2',
          datatype: 'int'
        c.outPorts.add 'out',
          datatype: 'object'
        .add 'error',
          datatype: 'object'
        p1 = new noflo.internalSocket.createSocket()
        p2 = new noflo.internalSocket.createSocket()
        p3 = new noflo.internalSocket.createSocket()
        d1 = new noflo.internalSocket.createSocket()
        d2 = new noflo.internalSocket.createSocket()
        out = new noflo.internalSocket.createSocket()
        err = new noflo.internalSocket.createSocket()
        c.inPorts.param1.attach p1
        c.inPorts.param2.attach p2
        c.inPorts.param3.attach p3
        c.inPorts.data1.attach d1
        c.inPorts.data2.attach d2
        c.outPorts.out.attach out
        c.outPorts.error.attach err

      it 'should wait for required params without default value', (done) ->
        noflo.helpers.WirePattern c,
          in: ['data1', 'data2']
          out: 'out'
          params: ['param1', 'param2', 'param3']
          async: true
        , (input, groups, out, callback) ->
          res =
            p1: c.params.param1
            p2: c.params.param2
            p3: c.params.param3
            d1: input.data1
            d2: input.data2
          out.send res
          do callback
        err.on 'data', (data) ->
          done data
        out.once 'data', (data) ->
          chai.expect(data).to.be.an 'object'
          chai.expect(data.p1).to.equal 'req'
          chai.expect(data.p2).to.be.undefined
          chai.expect(data.p3).to.equal 0
          chai.expect(data.d1).to.equal 'foo'
          chai.expect(data.d2).to.equal 123
          # And later when second param arrives
          out.once 'data', (data) ->
            chai.expect(data).to.be.an 'object'
            chai.expect(data.p1).to.equal 'req'
            chai.expect(data.p2).to.equal 568
            chai.expect(data.p3).to.equal 800
            chai.expect(data.d1).to.equal 'bar'
            chai.expect(data.d2).to.equal 456
            done()

        d1.send 'foo'
        d1.disconnect()
        d2.send 123
        d2.disconnect()
        c.sendDefaults()
        p1.send 'req'
        p1.disconnect()
        # the handler should be triggered here

        setTimeout ->
          p2.send 568
          p2.disconnect()
          p3.send 800
          p3.disconnect()

          d1.send 'bar'
          d1.disconnect()
          d2.send 456
          d2.disconnect()
        , 10

      it 'should work for async procs too', (done) ->
        noflo.helpers.WirePattern c,
          in: ['data1', 'data2']
          out: 'out'
          params: ['param1', 'param2', 'param3']
          async: true
        , (input, groups, out, callback) ->
          delay = if c.params.param2 then c.params.param2 else 10
          setTimeout ->
            res =
              p1: c.params.param1
              p2: c.params.param2
              p3: c.params.param3
              d1: input.data1
              d2: input.data2
            out.send res
            do callback
          , delay

        err.on 'data', (data) ->
          done data
        out.once 'data', (data) ->
          chai.expect(data).to.be.an 'object'
          chai.expect(data.p1).to.equal 'req'
          chai.expect(data.p2).to.equal 56
          chai.expect(data.p3).to.equal 0
          chai.expect(data.d1).to.equal 'foo'
          chai.expect(data.d2).to.equal 123
          done()

        p2.send 56
        p2.disconnect()
        d1.send 'foo'
        d1.disconnect()
        d2.send 123
        d2.disconnect()
        c.sendDefaults()
        p1.send 'req'
        p1.disconnect()
        # the handler should be triggered here

      it 'should reset state if shutdown() is called', (done) ->
        noflo.helpers.WirePattern c,
          in: ['data1', 'data2']
          out: 'out'
          params: ['param1', 'param2', 'param3']
          async: true
        , (input, groups, out, callback) ->
          out.send
            p1: c.params.param1
            p2: c.params.param2
            p3: c.params.param3
            d1: input.data1
            d2: input.data2
          do callback

        d1.send 'boo'
        d1.disconnect()
        p2.send 73
        p2.disconnect()

        chai.expect(c.inPorts.data1.getBuffer().length, 'data1 should have a packet').to.be.above 0
        chai.expect(c.inPorts.param2.getBuffer().length, 'param2 should have a packet').to.be.above 0

        c.shutdown (err) ->
          return done err if err
          for portName, port in c.inPorts.ports
            chai.expect(port.getBuffer()).to.eql []
            chai.expect(c.load).to.equal 0
          done()

      it 'should drop premature data if configured to do so', (done) ->
        noflo.helpers.WirePattern c,
          in: ['data1', 'data2']
          out: 'out'
          params: ['param1', 'param2', 'param3']
          dropInput: true
          async: true
        , (input, groups, out, callback) ->
          res =
            p1: c.params.param1
            p2: c.params.param2
            p3: c.params.param3
            d1: input.data1
            d2: input.data2
          out.send res
          do callback

        err.on 'data', (data) ->
          done data
        out.once 'data', (data) ->
          chai.expect(data).to.be.an 'object'
          chai.expect(data.p1).to.equal 'req'
          chai.expect(data.p2).to.equal 568
          chai.expect(data.p3).to.equal 800
          chai.expect(data.d1).to.equal 'bar'
          chai.expect(data.d2).to.equal 456
          done()

        c.sendDefaults()
        p2.send 568
        p2.disconnect()
        p3.send 800
        p3.disconnect()
        d1.send 'foo'
        d1.disconnect()
        d2.send 123
        d2.disconnect()
        # Data is dropped at this point

        setTimeout ->
          p1.send 'req'
          p1.disconnect()
          d1.send 'bar'
          d1.disconnect()
          d2.send 456
          d2.disconnect()
        , 10


    describe 'without output ports', ->
      foo = null
      sig = null
      before ->
        c = new noflo.Component
        c.inPorts.add 'foo'
        foo = noflo.internalSocket.createSocket()
        sig = noflo.internalSocket.createSocket()
        c.inPorts.foo.attach foo
        noflo.helpers.WirePattern c,
          in: 'foo'
          out: []
          async: true
        , (foo, grp, out, callback) ->
          setTimeout ->
            sig.send foo
            callback()
          , 20

      it 'should be fine still', (done) ->
        sig.on 'data', (data) ->
          chai.expect(data).to.equal 'foo'
          done()

        foo.send 'foo'
        foo.disconnect()

    describe 'with many inputs and groups', ->
      ins = noflo.internalSocket.createSocket()
      msg = noflo.internalSocket.createSocket()
      rep = noflo.internalSocket.createSocket()
      pth = noflo.internalSocket.createSocket()
      tkn = noflo.internalSocket.createSocket()
      out = noflo.internalSocket.createSocket()
      err = noflo.internalSocket.createSocket()
      before ->
        c = new noflo.Component
        c.token = null
        c.inPorts.add 'in', datatype: 'string'
        .add 'message', datatype: 'string'
        .add 'repository', datatype: 'string'
        .add 'path', datatype: 'string'
        .add 'token', datatype: 'string', (event, payload) ->
          c.token = payload if event is 'data'
        c.outPorts.add 'out', datatype: 'string'
        .add 'error', datatype: 'object'

        noflo.helpers.WirePattern c,
          in: ['in', 'message', 'repository', 'path']
          out: 'out'
          async: true
          forwardGroups: true
        , (data, groups, out, callback) ->
          setTimeout ->
            out.beginGroup data.path
            out.send data.message
            out.endGroup()
            do callback
          , 300
        c.inPorts.in.attach ins
        c.inPorts.message.attach msg
        c.inPorts.repository.attach rep
        c.inPorts.path.attach pth
        c.inPorts.token.attach tkn
        c.outPorts.out.attach out
        c.outPorts.error.attach err

      it 'should handle mixed flow well', (done) ->
        groups = []
        refGroups = [
          'foo'
          'http://techcrunch.com/2013/03/26/embedly-now/'
          'path data'
        ]
        ends = 0
        packets = []
        refData = ['message data']
        out.on 'begingroup', (grp) ->
          groups.push grp
        out.on 'endgroup', ->
          ends++
        out.on 'data', (data) ->
          packets.push data
        out.on 'disconnect', ->
          chai.expect(groups).to.deep.equal refGroups
          chai.expect(ends).to.equal 3
          chai.expect(packets).to.deep.equal refData
          done()

        err.on 'data', (data) ->
          done data

        rep.beginGroup 'foo'
        rep.beginGroup 'http://techcrunch.com/2013/03/26/embedly-now/'
        rep.send 'repo data'
        rep.endGroup()
        rep.endGroup()
        ins.beginGroup 'foo'
        ins.beginGroup 'http://techcrunch.com/2013/03/26/embedly-now/'
        ins.send 'ins data'
        msg.beginGroup 'foo'
        msg.beginGroup 'http://techcrunch.com/2013/03/26/embedly-now/'
        msg.send 'message data'
        msg.endGroup()
        msg.endGroup()
        ins.endGroup()
        ins.endGroup()
        ins.disconnect()
        msg.disconnect()
        pth.beginGroup 'foo'
        pth.beginGroup 'http://techcrunch.com/2013/03/26/embedly-now/'
        pth.send 'path data'
        pth.endGroup()
        pth.endGroup()
        pth.disconnect()
        rep.disconnect()

    describe 'for batch processing', ->
      # Component constructors
      newGenerator = (name) ->
        generator = new noflo.Component
        generator.inPorts.add 'count', datatype: 'int'
        generator.outPorts.add 'seq', datatype: 'int'
        noflo.helpers.WirePattern generator,
          in: 'count'
          out: 'seq'
          async: true
          forwardGroups: true
          ordered: true
        , (count, groups, seq, callback) ->
          sentCount = 0
          for i in [1..count]
            do (i) ->
              delay = if i > 10 then i % 10 else i
              setTimeout ->
                seq.send i
                sentCount++
                if sentCount is count
                  callback()
              , delay
      newDoubler = (name) ->
        doubler = new noflo.Component
        doubler.inPorts.add 'num', datatype: 'int'
        doubler.outPorts.add 'out', datatype: 'int'
        noflo.helpers.WirePattern doubler,
          in: 'num'
          out: 'out'
          forwardGroups: true
          async: true
        , (num, groups, out, callback) ->
          dbl = 2*num
          out.send dbl
          do callback
      newAdder = ->
        adder = new noflo.Component
        adder.inPorts.add 'num1', datatype: 'int'
        adder.inPorts.add 'num2', datatype: 'int'
        adder.outPorts.add 'sum', datatype: 'int'
        noflo.helpers.WirePattern adder,
          in: ['num1', 'num2']
          out: 'sum'
          forwardGroups: true
          async: true
          ordered: true
        , (args, groups, out, callback) ->
          sum = args.num1 + args.num2
          # out.send sum
          setTimeout ->
            out.send sum
            callback()
          , sum % 10
      newSeqsum = ->
        seqsum = new noflo.Component
        seqsum.sum = 0
        seqsum.inPorts.add 'seq', datatype: 'int'
        seqsum.outPorts.add 'sum', datatype: 'int'
        seqsum.process (input, output) ->
          return unless input.hasData 'seq'
          seqsum.sum += input.getData 'seq'
        return seqsum

      cntA = noflo.internalSocket.createSocket()
      cntB = noflo.internalSocket.createSocket()
      gen2dblA = noflo.internalSocket.createSocket()
      gen2dblB = noflo.internalSocket.createSocket()
      dblA2add = noflo.internalSocket.createSocket()
      dblB2add = noflo.internalSocket.createSocket()
      addr2sum = noflo.internalSocket.createSocket()
      sum = noflo.internalSocket.createSocket()
      before ->
        # Wires
        genA = newGenerator 'A'
        genB = newGenerator 'B'
        dblA = newDoubler 'A'
        dblB = newDoubler 'B'
        addr = newAdder()
        sumr = newSeqsum()

        genA.inPorts.count.attach cntA
        genB.inPorts.count.attach cntB
        genA.outPorts.seq.attach gen2dblA
        genB.outPorts.seq.attach gen2dblB
        dblA.inPorts.num.attach gen2dblA
        dblB.inPorts.num.attach gen2dblB
        dblA.outPorts.out.attach dblA2add
        dblB.outPorts.out.attach dblB2add
        addr.inPorts.num1.attach dblA2add
        addr.inPorts.num2.attach dblB2add
        addr.outPorts.sum.attach addr2sum
        sumr.inPorts.seq.attach addr2sum
        sumr.outPorts.sum.attach sum

      it 'should process sequences of packets separated by disconnects', (done) ->
        return @skip 'WirePattern doesn\'t see disconnects because of IP objects'
        expected = [ 24, 40 ]
        actual = []
        sum.on 'data', (data) ->
          actual.push data
        sum.on 'disconnect', ->
          chai.expect(actual).to.have.length.above 0
          chai.expect(expected).to.have.length.above 0
          act = actual.shift()
          exp = expected.shift()
          chai.expect(act).to.equal exp
          done() if expected.length is 0

        cntA.send 3
        cntA.disconnect()
        cntB.send 3
        cntB.disconnect()

        cntA.send 4
        cntB.send 4
        cntA.disconnect()
        cntB.disconnect()

    describe 'for batch processing with groups', ->
      c1 = new noflo.Component
      c1.inPorts.add 'count', datatype: 'int'
      c1.outPorts.add 'seq', datatype: 'int'
      c2 = new noflo.Component
      c2.inPorts.add 'num', datatype: 'int'
      c2.outPorts.add 'out', datatype: 'int'
      cnt = noflo.internalSocket.createSocket()
      c1c2 = noflo.internalSocket.createSocket()
      out = noflo.internalSocket.createSocket()

      c1.inPorts.count.attach cnt
      c1.outPorts.seq.attach c1c2
      c2.inPorts.num.attach c1c2
      c2.outPorts.out.attach out

      it 'should wrap entire sequence with groups', (done) ->
        noflo.helpers.WirePattern c1,
          in: 'count'
          out: 'seq'
          async: true
          forwardGroups: true
        , (count, groups, out, callback) ->
          for i in [0...count]
            do (i) ->
              setTimeout ->
                out.send i
              , 0
          setTimeout ->
            callback()
          , 3

        noflo.helpers.WirePattern c2,
          in: 'num'
          out: 'out'
          forwardGroups: true
          async: true
        , (num, groups, out, callback) ->
          chai.expect(groups).to.deep.equal ['foo', 'bar']
          out.send num
          do callback

        expected = ['<foo>', '<bar>', 0, 1, 2, '</bar>', '</foo>']
        actual = []
        out.on 'begingroup', (grp) ->
          actual.push "<#{grp}>"
        out.on 'endgroup', (grp) ->
          actual.push  "</#{grp}>"
        out.on 'data', (data) ->
          actual.push data
        out.on 'disconnect', ->
          chai.expect(actual).to.deep.equal expected
          done()

        cnt.beginGroup 'foo'
        cnt.beginGroup 'bar'
        cnt.send 3
        cnt.endGroup()
        cnt.endGroup()
        cnt.disconnect()

    describe 'with addressable ports', ->
      c = null
      p11 = null
      p12 = null
      p13 = null
      d11 = null
      d12 = null
      d13 = null
      d2 = null
      out = null
      err = null
      beforeEach ->
        c = new noflo.Component
        c.inPorts.add 'p1',
          datatype: 'int'
          addressable: true
          required: true
        .add 'd1',
          datatype: 'int'
          addressable: true
        .add 'd2',
          datatype: 'string'
        c.outPorts.add 'out',
          datatype: 'object'
        .add 'error',
          datatype: 'object'
        p11 = noflo.internalSocket.createSocket()
        p12 = noflo.internalSocket.createSocket()
        p13 = noflo.internalSocket.createSocket()
        d11 = noflo.internalSocket.createSocket()
        d12 = noflo.internalSocket.createSocket()
        d13 = noflo.internalSocket.createSocket()
        d2 = noflo.internalSocket.createSocket()
        out = noflo.internalSocket.createSocket()
        err = noflo.internalSocket.createSocket()
        c.inPorts.p1.attach p11
        c.inPorts.p1.attach p12
        c.inPorts.p1.attach p13
        c.inPorts.d1.attach d11
        c.inPorts.d1.attach d12
        c.inPorts.d1.attach d13
        c.inPorts.d2.attach d2
        c.outPorts.out.attach out
        c.outPorts.error.attach err

      it 'should wait for all param and any data port values (default)', (done) ->
        noflo.helpers.WirePattern c,
          in: ['d1', 'd2']
          params: 'p1'
          out: 'out'
          arrayPolicy: # default values
            in: 'any'
            params: 'all'
          async: true
        , (input, groups, out, callback) ->
          chai.expect(c.params.p1).to.deep.equal { 0: 1, 1: 2, 2: 3 }
          chai.expect(input.d1).to.deep.equal {0: 1}
          chai.expect(input.d2).to.equal 'foo'
          do callback
          done()

        d2.send 'foo'
        d2.disconnect()
        d11.send 1
        d11.disconnect()
        p11.send 1
        p11.disconnect()
        p12.send 2
        p12.disconnect()
        p13.send 3
        p13.disconnect()

      it 'should wait for any param and all data values', (done) ->
        noflo.helpers.WirePattern c,
          in: ['d1', 'd2']
          params: 'p1'
          out: 'out'
          arrayPolicy: # inversed
            in: 'all'
            params: 'any'
          async: true
        , (input, groups, out, callback) ->
          chai.expect(c.params.p1).to.deep.equal {0: 1}
          chai.expect(input.d1).to.deep.equal { 0: 1, 1: 2, 2: 3 }
          chai.expect(input.d2).to.equal 'foo'
          do callback
          done()

        out.on 'disconnect', ->
          console.log 'disc'

        d2.send 'foo'
        d2.disconnect()
        p11.send 1
        p11.disconnect()
        d11.send 1
        d11.disconnect()
        d12.send 2
        d12.disconnect()
        d13.send 3
        d13.disconnect()
        p12.send 2
        p12.disconnect()
        p13.send 3
        p13.disconnect()

      it 'should wait for all indexes of a single input', (done) ->
        noflo.helpers.WirePattern c,
          in: 'd1'
          out: 'out'
          arrayPolicy:
            in: 'all'
          async: true
        , (input, groups, out, callback) ->
          chai.expect(input).to.deep.equal { 0: 1, 1: 2, 2: 3 }
          do callback
          done()

        d11.send 1
        d11.disconnect()
        d12.send 2
        d12.disconnect()
        d13.send 3
        d13.disconnect()

      it 'should behave normally with string output from another component', (done) ->
        c = new noflo.Component
        c.inPorts.add 'd1',
          datatype: 'string'
          addressable: true
        c.outPorts.add 'out',
          datatype: 'object'
        d11 = noflo.internalSocket.createSocket()
        d12 = noflo.internalSocket.createSocket()
        d13 = noflo.internalSocket.createSocket()
        out = noflo.internalSocket.createSocket()
        c.inPorts.d1.attach d11
        c.inPorts.d1.attach d12
        c.inPorts.d1.attach d13
        c.outPorts.out.attach out
        c2 = new noflo.Component
        c2.inPorts.add 'in', datatype: 'string'
        c2.outPorts.add 'out', datatype: 'string'
        noflo.helpers.WirePattern c2,
          in: 'in'
          out: 'out'
          forwardGroups: true
          async: true
        , (input, groups, out, callback) ->
          out.send input
          do callback
        d3 = noflo.internalSocket.createSocket()
        c2.inPorts.in.attach d3
        c2.outPorts.out.attach d11

        noflo.helpers.WirePattern c,
          in: 'd1'
          out: 'out'
          async: true
        , (input, groups, out, callback) ->
          chai.expect(input).to.deep.equal {0: 'My string'}
          do callback
          done()

        d3.send 'My string'
        d3.disconnect()

    describe 'when grouping requests', ->
      c = new noflo.Component
      c.inPorts.add 'x', datatype: 'int'
      .add 'y', datatype: 'int'
      c.outPorts.add 'out', datatype: 'object'
      x = noflo.internalSocket.createSocket()
      y = noflo.internalSocket.createSocket()
      out = noflo.internalSocket.createSocket()
      c.inPorts.x.attach x
      c.inPorts.y.attach y
      c.outPorts.out.attach out

      getUuid = ->
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace /[xy]/g, (c) ->
          r = Math.random()*16|0
          v = if c is 'x' then r else r&0x3|0x8
          v.toString 16
      isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

      generateRequests = (num) ->
        reqs = {}
        for i in [1..num]
          req =
            id: getUuid()
            num: i
          if i % 3 is 0
            req.x = i
          else if i % 7 is 0
            req.y = i
          else
            req.x = i
            req.y = 2*i
          reqs[req.id] = req
        reqs

      sendRequests = (reqs, delay) ->
        for id, req of reqs
          do (req) ->
            setTimeout ->
              if 'x' of req
                x.beginGroup req.id
                x.beginGroup 'x'
                x.beginGroup req.num
                x.send req.x
                x.endGroup()
                x.endGroup()
                x.endGroup()
                x.disconnect()
              if 'y' of req
                y.beginGroup req.id
                y.beginGroup 'y'
                y.beginGroup req.num
                y.send req.y
                y.endGroup()
                y.endGroup()
                y.endGroup()
                y.disconnect()
            , delay*req.num

      before ->
        noflo.helpers.WirePattern c,
          in: ['x', 'y']
          out: 'out'
          async: true
          forwardGroups: true
          group: isUuid
          gcFrequency: 2 # every 2 requests
          gcTimeout: 0.02 # older than 20ms
        , (input, groups, out, done) ->
          setTimeout ->
            out.send
              id: groups[0]
              x: input.x
              y: input.y
            done()
          , 3

      it 'should group requests by outer UUID group', (done) ->
        reqs = generateRequests 10
        count = 0

        out.on 'data', (data) ->
          count++
          chai.expect(data.x).to.equal reqs[data.id].x
          chai.expect(data.y).to.equal reqs[data.id].y
          done() if count is 6 # 6 complete requests processed

        sendRequests reqs, 10

    describe 'when using scopes', ->
      c = new noflo.Component
        inPorts:
          x: datatype: 'int'
          y: datatype: 'int'
        outPorts:
          out: datatype: 'object'
      x = noflo.internalSocket.createSocket()
      y = noflo.internalSocket.createSocket()
      out = noflo.internalSocket.createSocket()
      c.inPorts.x.attach x
      c.inPorts.y.attach y
      c.outPorts.out.attach out

      getUuid = ->
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace /[xy]/g, (c) ->
          r = Math.random()*16|0
          v = if c is 'x' then r else r&0x3|0x8
          v.toString 16
      isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

      generateRequests = (num) ->
        reqs = {}
        for i in [1..num]
          req =
            id: getUuid()
            num: i
          if i % 3 is 0
            req.x = i
          else if i % 7 is 0
            req.y = i
          else
            req.x = i
            req.y = 2*i
          reqs[req.id] = req
        reqs

      sendRequests = (reqs, delay) ->
        for id, req of reqs
          do (req) ->
            setTimeout ->
              if 'x' of req
                x.post new noflo.IP 'openBracket', 'x', scope: req.id
                x.post new noflo.IP 'data', req.x, scope: req.id
                x.post new noflo.IP 'closeBracket', null, scope: req.id
                x.disconnect()
              if 'y' of req
                y.post new noflo.IP 'openBracket', 'y', scope: req.id
                y.post new noflo.IP 'data', req.y, scope: req.id
                y.post new noflo.IP 'closeBracket', null, scope: req.id
                y.disconnect()
            , delay*req.num

      before ->
        noflo.helpers.WirePattern c,
          in: ['x', 'y']
          out: 'out'
          async: true
          forwardGroups: true
        , (input, groups, out, done, postpone, resume, scope) ->
          setTimeout ->
            out.send
              id: scope
              x: input.x
              y: input.y
            done()
          , 3

      it 'should scope requests by proper UUID', (done) ->
        reqs = generateRequests 10
        count = 0

        out.on 'data', (data) ->
          count++
          chai.expect(data.x).to.equal reqs[data.id].x
          chai.expect(data.y).to.equal reqs[data.id].y
          done() if count is 6 # 6 complete requests processed

        sendRequests reqs, 10
