if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  chai = require 'chai' unless chai
  helpers = require '../src/lib/Helpers'
  component = require '../src/lib/Component'
  socket = require '../src/lib/InternalSocket'
  Substream = require('../src/lib/Streams').Substream
else
  helpers = require 'noflo/src/lib/Helpers'
  component = require 'noflo/src/lib/Component'
  socket = require 'noflo/src/lib/InternalSocket'
  Substream = require('noflo/src/lib/Streams').Substream

describe 'Component traits', ->
  describe 'MapComponent', ->
    c = null
    it 'should pass data to the callback', ->
      c = new component.Component
      c.inPorts.add 'in'
      c.outPorts.add 'out',
        required: false
      helpers.MapComponent c, (data) ->
        chai.expect(data).to.equal 1
      s = new socket.createSocket()
      c.inPorts.in.attach s
      s.send 1
    it 'should pass groups to the callback', ->
      c = new component.Component
      c.inPorts.add 'in'
      c.outPorts.add 'out',
        required: false
      helpers.MapComponent c, (data, groups) ->
        chai.expect(groups).to.eql [
          'one'
          'two'
        ]
        chai.expect(data).to.equal 1
      s = new socket.createSocket()
      c.inPorts.in.attach s
      s.beginGroup 'one'
      s.beginGroup 'two'
      s.send 1
    it 'should send groups and disconnect through', (done) ->
      c = new component.Component
      c.inPorts.add 'in'
      c.outPorts.add 'out',
        required: false
      helpers.MapComponent c, (data, groups, out) ->
        out.send data * 2

      s = new socket.createSocket()
      c.inPorts.in.attach s
      s2 = new socket.createSocket()
      c.outPorts.out.attach s2

      groups = []
      s2.on 'begingroup', (group) ->
        groups.push group
      s2.on 'data', (data) ->
        chai.expect(groups.length).to.equal 2
        chai.expect(data).to.equal 6
      s2.on 'endgroup', ->
        groups.pop()
      s2.on 'disconnect', ->
        chai.expect(groups.length).to.equal 0
        done()
      s.beginGroup 'one'
      s.beginGroup 'two'
      s.send 3
      s.endGroup()
      s.endGroup()
      s.disconnect()

  describe 'WirePattern', ->
    describe 'when grouping by packet groups', ->
      c = new component.Component
      c.inPorts.add 'x',
        required: true
        datatype: 'int'
      c.inPorts.add 'y',
        required: true
        datatype: 'int'
      c.inPorts.add 'z',
        required: true
        datatype: 'int'
      c.outPorts.add 'point'
      x = new socket.createSocket()
      y = new socket.createSocket()
      z = new socket.createSocket()
      p = new socket.createSocket()
      c.inPorts.x.attach x
      c.inPorts.y.attach y
      c.inPorts.z.attach z
      c.outPorts.point.attach p

      it 'should pass data and groups to the callback', (done) ->
        src =
          111: {x: 1, y: 2, z: 3}
          222: {x: 4, y: 5, z: 6}
          333: {x: 7, y: 8, z: 9}
        helpers.WirePattern c,
          in: ['x', 'y', 'z']
          out: 'point'
          group: true
          forwardGroups: true
        , (data, groups, out) ->
          chai.expect(groups.length).to.be.above 0
          chai.expect(data).to.deep.equal src[groups[0]]
          out.send data

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
        p.removeAllListeners()
        helpers.WirePattern c,
          in: ['x', 'y', 'z']
          out: 'point'
        , (data, groups, out) ->
          chai.expect(groups.length).to.equal 0
          out.send {x: data.x, y: data.y, z: data.z}

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

        helpers.WirePattern c,
          in: ['x', 'y', 'z']
          out: 'point'
          group: true
          forwardGroups: true
        , (data, groups, out) ->
          out.send {x: data.x, y: data.y, z: data.z}

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

        helpers.WirePattern c,
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

        p.removeAllListeners()
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
        helpers.WirePattern c,
          in: ['x', 'y']
          out: 'point'
        , (data, groups, out) ->
          out.send { x: data.x, y: data.y }

        p.removeAllListeners()
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
        helpers.WirePattern c,
          in: ['x', 'y', 'z']
          out: 'point'
          forwardGroups: 'y'
        , (data, groups, out) ->
          out.send { x: data.x, y: data.y, z: data.z }

        p.removeAllListeners()
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
        helpers.WirePattern c,
          in: ['x', 'y', 'z']
          out: 'point'
          forwardGroups: [ 'x', 'z' ]
        , (data, groups, out) ->
          out.send { x: data.x, y: data.y, z: data.z }

        p.removeAllListeners()
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

    describe 'when in async mode and packet order matters', ->
      c = new component.Component
      c.inPorts.add 'delay', datatype: 'int'
      c.inPorts.add 'msg', datatype: 'string'
      c.outPorts.add 'out', datatype: 'object'
      c.outPorts.add 'load', datatype: 'int'
      delay = new socket.createSocket()
      msg = new socket.createSocket()
      out = new socket.createSocket()
      load = new socket.createSocket()
      c.inPorts.delay.attach delay
      c.inPorts.msg.attach msg
      c.outPorts.out.attach out
      c.outPorts.load.attach load

      it 'should preserve input order at the output', (done) ->
        helpers.WirePattern c,
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

      it 'should support complex substreams', (done) ->
        out.removeAllListeners()
        load.removeAllListeners()
        c.cntr = 0
        helpers.WirePattern c,
          in: ['delay', 'msg']
          async: true
          ordered: true
          group: false
          receiveStreams: ['delay', 'msg']
        , (data, groups, res, callback) ->
          # Substream to object conversion validation
          # (the hard way)
          chai.expect(data.delay instanceof Substream).to.be.true
          chai.expect(data.msg instanceof Substream).to.be.true
          delayObj = data.delay.toObject()
          msgObj = data.msg.toObject()
          index0 = c.cntr.toString()
          chai.expect(Object.keys(delayObj)[0]).to.equal index0
          chai.expect(Object.keys(msgObj)[0]).to.equal index0
          subDelay = delayObj[index0]
          subMsg = msgObj[index0]
          index1 = (10 + c.cntr).toString()
          chai.expect(Object.keys(subDelay)[0]).to.equal index1
          chai.expect(Object.keys(subMsg)[0]).to.equal index1
          delayData = subDelay[index1]
          msgData = subMsg[index1]
          chai.expect(delayData).to.equal sample[c.cntr].delay
          chai.expect(msgData).to.equal sample[c.cntr].msg
          c.cntr++

          setTimeout ->
            # Substream tree traversal (the easy way)
            for k0, v0 of msgObj
              res.beginGroup k0
              res.send k0
              for k1, v1 of v0
                res.beginGroup k1
                res.send
                  delay: delayObj[k0][k1]
                  msg: msgObj[k0][k1]
                res.endGroup()
                res.send k1
              res.endGroup()
            callback()
          , data.delay

        sample = [
          { delay: 30, msg: "one" }
          { delay: 0, msg: "two" }
          { delay: 20, msg: "three" }
          { delay: 10, msg: "four" }
        ]

        expected = [
          '0', '0', '10', sample[0], '10'
          '1', '1', '11', sample[1], '11'
          '2', '2', '12', sample[2], '12'
          '3', '3', '13', sample[3], '13'
        ]

        out.on 'begingroup', (grp) ->
          chai.expect(grp).to.equal expected.shift()
        out.on 'data', (data) ->
          chai.expect(data).to.deep.equal expected.shift()
        out.on 'disconnect', ->
          done() if expected.length is 0

        for i in [0..3]
          delay.beginGroup i
          delay.beginGroup 10 + i
          delay.send sample[i].delay
          delay.endGroup()
          delay.endGroup()
          msg.beginGroup i
          msg.beginGroup 10 + i
          msg.send sample[i].msg
          msg.endGroup()
          msg.endGroup()
          delay.disconnect()
          msg.disconnect()

    describe 'when grouping by field', ->
      c = new component.Component
      c.inPorts.add 'user', datatype: 'object'
      c.inPorts.add 'message', datatype: 'object'
      c.outPorts.add 'signedMessage'
      usr = new socket.createSocket()
      msg = new socket.createSocket()
      umsg = new socket.createSocket()
      c.inPorts.user.attach usr
      c.inPorts.message.attach msg
      c.outPorts.signedMessage.attach umsg

      it 'should match objects by specific field', (done) ->
        helpers.WirePattern c,
          in: ['user', 'message']
          out: 'signedMessage'
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
      c = new component.Component
      c.inPorts.add 'num', datatype: 'int'
      c.inPorts.add 'str', datatype: 'string'
      c.outPorts.add 'odd', datatype: 'object'
      c.outPorts.add 'even', datatype: 'object'
      num = new socket.createSocket()
      str = new socket.createSocket()
      odd = new socket.createSocket()
      even = new socket.createSocket()
      c.inPorts.num.attach num
      c.inPorts.str.attach str
      c.outPorts.odd.attach odd
      c.outPorts.even.attach even

      it 'should send output to one or more of them', (done) ->
        numbers = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']

        helpers.WirePattern c,
          in: ['num', 'str']
          out: ['odd', 'even']
          async: true
          ordered: true
        , (data, groups, outs, callback) ->
          setTimeout ->
            if data.num % 2 is 1
              outs.odd.beginGroup grp for grp in groups
              outs.odd.send data
              outs.odd.endGroup() for grp in groups
            else
              outs.even.beginGroup grp for grp in groups
              outs.even.send data
              outs.even.endGroup() for grp in groups
            callback()
          , 0

        grpCounter = 0
        dataCounter = 0

        odd.on 'begingroup', (grp) ->
          grpCounter++
        odd.on 'data', (data) ->
          chai.expect(data.num % 2).to.equal 1
          dataCounter++
        odd.on 'disconnect', ->
          done() if dataCounter is 10 and grpCounter is 10

        even.on 'begingroup', (grp) ->
          grpCounter++
        even.on 'data', (data) ->
          chai.expect(data.num % 2).to.equal 0
          chai.expect(data.str).to.equal numbers[data.num]
          dataCounter++
        even.on 'disconnect', ->
          done() if dataCounter is 10 and grpCounter is 10

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
      p1 = p2 = d1 = d2 = out = err = 0
      beforeEach ->
        c = new component.Component
        c.inPorts.add 'param1',
          datatype: 'string'
          required: true
        c.inPorts.add 'param2',
          datatype: 'int'
          required: false
        c.inPorts.add 'data1',
          datatype: 'string'
        c.inPorts.add 'data2',
          datatype: 'int'
        c.outPorts.add 'out',
          datatype: 'object'
        c.outPorts.add 'error',
          datatype: 'object'
        p1 = new socket.createSocket()
        p2 = new socket.createSocket()
        d1 = new socket.createSocket()
        d2 = new socket.createSocket()
        out = new socket.createSocket()
        err = new socket.createSocket()
        c.inPorts.param1.attach p1
        c.inPorts.param2.attach p2
        c.inPorts.data1.attach d1
        c.inPorts.data2.attach d2
        c.outPorts.out.attach out
        c.outPorts.error.attach err

      it 'should wait for required params', (done) ->
        helpers.WirePattern c,
          in: ['data1', 'data2']
          out: 'out'
          params: ['param1', 'param2']
        , (input, groups, out) ->
          res =
            p1: c.params.param1
            p2: c.params.param2
            d1: input.data1
            d2: input.data2
          out.send res

        out.once 'data', (data) ->
          chai.expect(data).to.be.an 'object'
          chai.expect(data.p1).to.equal 'req'
          chai.expect(data.p2).to.be.undefined
          chai.expect(data.d1).to.equal 'foo'
          chai.expect(data.d2).to.equal 123
          # And later when second param arrives
          out.once 'data', (data) ->
            chai.expect(data).to.be.an 'object'
            chai.expect(data.p1).to.equal 'req'
            chai.expect(data.p2).to.equal 568
            chai.expect(data.d1).to.equal 'bar'
            chai.expect(data.d2).to.equal 456
            done()

        d1.send 'foo'
        d2.send 123
        p1.send 'req'
        # the handler should be triggered here
        p2.send 568

        d1.send 'bar'
        d2.send 456

      it 'should work for async procs too', (done) ->
        helpers.WirePattern c,
          in: ['data1', 'data2']
          out: 'out'
          params: ['param1', 'param2']
        , (input, groups, out) ->
          delay = if c.params.param2 then c.params.param2 else 10
          setTimeout ->
            res =
              p1: c.params.param1
              p2: c.params.param2
              d1: input.data1
              d2: input.data2
            out.send res
          , delay

        out.once 'data', (data) ->
          chai.expect(data).to.be.an 'object'
          chai.expect(data.p1).to.equal 'req'
          chai.expect(data.p2).to.equal 56
          chai.expect(data.d1).to.equal 'foo'
          chai.expect(data.d2).to.equal 123
          done()

        p2.send 56
        d1.send 'foo'
        d2.send 123
        p1.send 'req'
        # the handler should be triggered here


  describe 'MultiError', ->
    describe 'with simple sync processes', ->
      c = new component.Component
      c.inPorts.add 'form', datatype: 'object', (event, payload) ->
        return unless event is 'data'
        # Validate form
        unless payload.name and payload.name.match /^\w{3,16}$/
          c.error helpers.CustomError 'Incorrect name',
            kind: 'form_error'
            code: 'invalid_name'
            param: 'name'
        unless payload.email and payload.email.match /^\w+@\w+\.\w+$/
          c.error helpers.CustomError 'Incorrect email',
            kind: 'form_error'
            code: 'invalid_email'
            param: 'email'
        unless payload.accept
          c.error helpers.CustomError 'Terms have to be accepted',
            kind: 'form_error'
            code: 'terms_not_accepted'
            param: 'accept'
        # Finish validation
        return c.fail() if c.hasErrors

        # Emulating some processing logic here
        if payload.name is 'DelayLama'
          # oops
          c.outPorts.saved.send false
          c.outPorts.saved.disconnect()
          return c.fail helpers.CustomError 'Suspended for a meditation',
            kind: 'runtime_error'
            code: 'delay_lama_detected'
        else
          c.outPorts.saved.send true
          c.outPorts.saved.disconnect()

      c.outPorts.add 'saved', datatype: 'boolean'
      c.outPorts.add 'error', datatype: 'object'
      form = new socket.createSocket()
      saved = new socket.createSocket()
      err = new socket.createSocket()
      c.inPorts.form.attach form
      c.outPorts.saved.attach saved
      c.outPorts.error.attach err
      helpers.MultiError c

      it 'should support multiple customized error messages', (done) ->
        errCount = 0
        err.on 'data', (data) ->
          chai.expect(data instanceof Error).to.be.true
          chai.expect(data.kind).to.equal 'form_error'
          errCount++
        err.on 'disconnect', ->
          chai.expect(errCount).to.equal 3
          done()

        form.send
          name: 'Bo'
          email: 'missing'
        form.disconnect()

      it 'should pass if everything is correct', (done) ->
        hadData = false
        saved.removeAllListeners()
        saved.once 'data', (data) ->
          chai.expect(data).to.be.true
          hadData = true
        saved.once 'disconnect', ->
          chai.expect(hadData).to.be.true
          done()

        err.removeAllListeners()
        err.on 'data', (data) ->
          done data

        form.send
          name: 'Josh'
          email: 'josh@example.com'
          accept: true
        form.disconnect()

      it 'should handle fatals and runtimes normally', (done) ->
        saved.once 'data', (data) ->
          chai.expect(data).to.be.false

        err.removeAllListeners()
        errCount = 0
        err.once 'data', (data) ->
          chai.expect(data instanceof Error).to.be.true
          chai.expect(data.kind).to.equal 'runtime_error'
          errCount++
        err.once 'disconnect', ->
          chai.expect(errCount).to.equal 1
          done()

        form.send
          name: 'DelayLama'
          email: 'delay@lama.ti'
          accept: true
        form.disconnect()

    describe 'with async processes and groups', ->
      c = new component.Component
      c.inPorts.add 'form', datatype: 'object'
      c.outPorts.add 'saved', datatype: 'boolean'
      c.outPorts.add 'error', datatype: 'object'
      form = new socket.createSocket()
      saved = new socket.createSocket()
      err = new socket.createSocket()
      c.inPorts.form.attach form
      c.outPorts.saved.attach saved
      c.outPorts.error.attach err
      helpers.WirePattern c,
        in: 'form'
        out: 'saved'
        async: true
        forwardGroups: true
      , (payload, groups, out, callback) ->
        # Validate form
        unless payload.name and payload.name.match /^\w{3,16}$/
          c.error helpers.CustomError('Incorrect name',
            kind: 'form_error'
            code: 'invalid_name'
            param: 'name'
          ), groups
        unless payload.email and payload.email.match /^\w+@\w+\.\w+$/
          c.error helpers.CustomError('Incorrect email',
            kind: 'form_error'
            code: 'invalid_email'
            param: 'email'
          ), groups
        unless payload.accept
          c.error helpers.CustomError('Terms have to be accepted',
            kind: 'form_error'
            code: 'terms_not_accepted'
            param: 'accept'
          ), groups
        # Finish validation
        return callback no if c.hasErrors

        setTimeout ->
          # Emulating some processing logic here
          if payload.name is 'DelayLama'
            # oops
            out.send false
            return callback helpers.CustomError 'Suspended for a meditation',
              kind: 'runtime_error'
              code: 'delay_lama_detected'
          else
            out.send true
            callback()
        , 10
      helpers.MultiError c, 'Registration'

      it 'should support multiple error messages and groups', (done) ->
        expected = [
          'Registration'
          'async0'
          'async0'
          'async0'
        ]
        actual = []
        errCount = 0
        err.on 'begingroup', (grp) ->
          actual.push grp
        err.on 'data', (data) ->
          chai.expect(data instanceof Error).to.be.true
          chai.expect(data.kind).to.equal 'form_error'
          errCount++
        err.on 'disconnect', ->
          chai.expect(errCount).to.equal 3
          chai.expect(actual).to.deep.equal expected
          done()

        form.beginGroup 'async0'
        form.send
          name: 'Bo'
          email: 'missing'
        form.endGroup()
        form.disconnect()

      it 'should pass if everything is correct', (done) ->
        hadData = false
        saved.removeAllListeners()
        saved.once 'data', (data) ->
          chai.expect(data).to.be.true
          hadData = true
        saved.once 'disconnect', ->
          chai.expect(hadData).to.be.true
          done()

        err.removeAllListeners()
        err.on 'data', (data) ->
          done data

        form.send
          name: 'Josh'
          email: 'josh@example.com'
          accept: true
        form.disconnect()

      it 'should handle fatals and runtimes normally', (done) ->
        saved.once 'data', (data) ->
          chai.expect(data).to.be.false

        err.removeAllListeners()
        errCount = 0
        grpCount = 0
        err.on 'begingroup', (grp) ->
          chai.expect(grp).to.equal 'Registration'
          grpCount++
        err.once 'data', (data) ->
          chai.expect(data instanceof Error).to.be.true
          chai.expect(data.kind).to.equal 'runtime_error'
          errCount++
        err.once 'disconnect', ->
          chai.expect(errCount).to.equal 1
          chai.expect(grpCount).to.equal 1
          done()

        form.send
          name: 'DelayLama'
          email: 'delay@lama.ti'
          accept: true
        form.disconnect()

    describe 'with many inputs and groups', ->
      c = new component.Component
      c.token = null
      c.inPorts.add 'in', datatype: 'string'
      c.inPorts.add 'message', datatype: 'string'
      c.inPorts.add 'repository', datatype: 'string'
      c.inPorts.add 'path', datatype: 'string'
      c.inPorts.add 'token', datatype: 'string', (event, payload) ->
        c.token = payload if event is 'data'
      c.outPorts.add 'out', datatype: 'string'
      c.outPorts.add 'error', datatype: 'object'

      helpers.WirePattern c,
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

      ins = socket.createSocket()
      msg = socket.createSocket()
      rep = socket.createSocket()
      pth = socket.createSocket()
      tkn = socket.createSocket()
      out = socket.createSocket()
      err = socket.createSocket()
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
