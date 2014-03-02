chai = require 'chai' unless chai
if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  outport = require '../src/lib/OutPort'
  socket = require '../src/lib/InternalSocket'
else
  outport = require 'noflo/src/lib/OutPort.js'
  socket = require 'noflo/src/lib/InternalSocket.js'

describe 'Outport Port', ->
  describe 'with addressable ports', ->
    s1 = s2 = s3 = null
    beforeEach ->
      s1 = new socket
      s2 = new socket
      s3 = new socket

    it 'should be able to send to a specific port', ->
      p = new outport
        addressable: true
      p.attach s1
      p.attach s2
      p.attach s3
      cb1 = jasmine.createSpy()
      cb2 = jasmine.createSpy()
      cb3 = jasmine.createSpy()
      s1.on 'data', cb1
      s2.on 'data', cb2
      s3.on 'data', cb3
      p.send 'some-data', 2
      cb1.not.toHaveBeenCalled()
      cb2.toHaveBeenCalled()
      cb3.not.toHaveBeenCalled()

    it 'should send to all with no specific port', ->
      p = new outport
        addressable: true
      p.attach s1
      p.attach s2
      p.attach s3
      cb1 = jasmine.createSpy()
      cb2 = jasmine.createSpy()
      cb3 = jasmine.createSpy()
      s1.on 'data', cb1
      s2.on 'data', cb2
      s3.on 'data', cb3
      p.send 'some-data'
      cb1.toHaveBeenCalled()
      cb2.toHaveBeenCalled()
      cb3.toHaveBeenCalled()

    it 'should throw an error when a specific port is requested with non-addressable port', ->
      p = new outport
      p.attach s1
      p.attach s2
      p.attach s3
      f ->
        p.send 'some-data'
      expect(f).toHaveThrown()
