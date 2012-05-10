noflo = require 'noflo'
{QueueComponent} = require './QueueComponent'

class SendMessage extends QueueComponent
  constructor: ->
    do @basePortSetup

    groups = []

    @inPorts.in = new noflo.ArrayPort

    @inPorts.in.on 'begingroup', (group) =>
      groups.push group

    @inPorts.in.on 'data', (data) =>
      return unless @mq
      @mq.publish groups.join(':'), data

    @inPorts.in.on 'endgroup', =>
      groups.pop()

exports.getComponent = -> new SendMessage
