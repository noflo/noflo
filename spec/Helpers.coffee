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

  describe 'GroupComponent', ->
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
      helpers.GroupComponent c, (data, groups, out) ->
        chai.expect(data).to.deep.equal src[groups[0]]
        out.send data
        # done() if groups[0] is 333
      , ['x', 'y', 'z'], 'point'

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
      helpers.GroupComponent c, (data, groups, out) ->
        chai.expect(groups.length).to.equal 0
        out.send {x: data.x, y: data.y, z: data.z}
      , ['x', 'y', 'z'], 'point'

      p.once 'data', (data) ->
        chai.expect(data).to.deep.equal {x: 123, y: 456, z: 789}
        done()

      x.send 123
      x.disconnect()
      y.send 456
      y.disconnect()
      z.send 789
      z.disconnect()

    it 'should process inputs for different groups independently', (done) ->
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

      helpers.GroupComponent c, (data, groups, out) ->
        out.send {x: data.x, y: data.y, z: data.z}
      , ['x', 'y', 'z'], 'point'

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
