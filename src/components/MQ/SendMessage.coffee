noflo = require 'noflo'
{QueueComponent} = require './QueueComponent'

class SendMessage extends QueueComponent
  constructor: ->
    do @basePortSetup
    mq = null

    groups = []

    @inPorts.in = new noflo.ArrayPort

    @inPorts.in.on 'connect', =>
      mq = @getMQ()

    @inPorts.in.on 'begingroup', (group) =>
      groups.push group

    @inPorts.in.on 'data', (data) =>
      return unless mq
      return mq.publish groups.join(':'), data if mq.pub.connected
      mq.pub.once 'connect', ->
        mq.publish groups.join(':'), data

    @inPorts.in.on 'endgroup', =>
      groups.pop()

    @inPorts.in.on 'disconnect', =>
      do mq.disconnect if mq
      mq = null

exports.getComponent = -> new SendMessage
