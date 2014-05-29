if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  chai = require 'chai' unless chai
  helpers = require '../src/lib/Helpers'
  component = require '../src/lib/Component'
  socket = require '../src/lib/InternalSocket'
else
  helpers = require 'noflo/src/lib/Helpers'
  component = require 'noflo/src/lib/Component'
  socket = require 'noflo/src/lib/InternalSocket'

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

  describe 'GroupedInput', ->
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
        helpers.GroupedInput c,
          in: ['x', 'y', 'z']
          out: 'point'
          group: true
        , (data, groups, out) ->
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
        helpers.GroupedInput c,
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

        helpers.GroupedInput c,
          in: ['x', 'y', 'z']
          out: 'point'
          group: true
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

        helpers.GroupedInput c,
          in: ['x', 'y', 'z']
          out: 'point'
          async: true
          group: true
        , (data, groups, out, callback) ->
          setTimeout ->
            out.send {x: data.x, y: data.y, z: data.z}
            callback()
          , 100

        p.removeAllListeners()
        counter = 0
        p.on 'begingroup', (grp) ->
          counter++
        p.on 'endgroup', ->
          counter--
        p.once 'data', (data) ->
          chai.expect(data).to.deep.equal point
        p.once 'disconnect', ->
          chai.expect(counter).to.equal 0
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

      it 'should not forward groups if grouping is off', (done) ->
        point =
          x: 123
          y: 456
        helpers.GroupedInput c,
          in: ['x', 'y']
          out: 'point'
        , (data, groups, out) ->
          chai.expect(groups.length).to.equal 0
          out.send { x: data.x, y: data.y }

        p.removeAllListeners()
        counter = 0
        p.on 'begingroup', (grp) ->
          counter++
        p.on 'data', (data) ->
          chai.expect(data).to.deep.equal point
        p.once 'disconnect', ->
          chai.expect(counter).to.equal 0
          done()

        x.beginGroup 'doNotForwardMe'
        y.beginGroup 'doNotForwardMe'
        x.send point.x
        y.send point.y
        x.endGroup()
        y.endGroup()

      it 'should forward groups from a specific port only', (done) ->
        point =
          x: 123
          y: 456
          z: 789
        refGroups = ['boo']
        helpers.GroupedInput c,
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

      it 'should forward groups from selected ports only', (done) ->
        point =
          x: 123
          y: 456
          z: 789
        refGroups = ['foo', 'bar']
        helpers.GroupedInput c,
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

    describe 'when reaction depends on external events', (done) ->
      c = new component.Component
      c.inPorts.add 'trigger', datatype: 'string', (event, payload) ->
        c.resume payload if event is 'data'
      c.inPorts.add 'x', datatype: 'int'
      c.inPorts.add 'y', datatype: 'int'
      c.outPorts.add 'out', datatype: 'object'
      trigger = new socket.createSocket()
      x = new socket.createSocket()
      y = new socket.createSocket()
      out = new socket.createSocket()
      c.inPorts.trigger.attach trigger
      c.inPorts.x.attach x
      c.inPorts.y.attach y
      c.outPorts.out.attach out

      helpers.GroupedInput c,
        in: ['x', 'y']
        group: true
        async: true
      , (data, groups, out, complete) ->
        task = (trigger) ->
          data.trigger = trigger
          out.send data
          complete()
        if groups.length is 1 and groups[0] is 'later'
          c.postpone groups[0], -> task 'later'
        else
          task 'now'

      it 'should postpone processing of a tuple', (done) ->
        counter = 0

        out.on 'data', (data) ->
          chai.expect(data.trigger).to.equal 'now'
          chai.expect(data.x % 2).to.equal 1
          chai.expect(data.y % 2).to.equal 1
          counter++
          done() if counter is 2

        x.beginGroup 'now'
        x.send 1
        x.endGroup()
        y.beginGroup 'now'
        y.send 3
        y.endGroup()
        x.disconnect()
        y.disconnect()

        x.beginGroup 'later'
        x.send 2
        x.endGroup()
        y.beginGroup 'later'
        y.send 4
        y.endGroup()
        x.disconnect()
        y.disconnect()

        x.beginGroup 'now'
        x.send 5
        x.endGroup()
        y.beginGroup 'now'
        y.send 7
        y.endGroup()
        x.disconnect()
        y.disconnect()

      it '... and should resume postponed task later', (done) ->
        out.removeAllListeners()

        out.once 'data', (data) ->
          chai.expect(data.trigger).to.equal 'later'
          chai.expect(data.x % 2).to.equal 0
          chai.expect(data.y % 2).to.equal 0
          done()

        trigger.send 'later'

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
        helpers.GroupedInput c,
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
            , req
        for req, mesg of messages
          do (req, mesg) ->
            setTimeout ->
              msg.send mesg
            , req
