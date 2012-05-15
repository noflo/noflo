noflo = require 'noflo'
{QueueComponent} = require './QueueComponent'

class Listen extends QueueComponent
  constructor: ->
    do @basePortSetup
    @mq = null

    @inPorts.topic = new noflo.ArrayPort
    @outPorts =
      out: new noflo.ArrayPort

    @inPorts.topic.on 'connect', =>
      @mq = @getMQ()

    @inPorts.topic.on 'data', (topic) =>
      return unless @mq
      groups = topic.split ':'
      @mq.subscribe topic, (err, topics) =>
        @mq.on topic, (id, message) =>
          @outPorts.out.beginGroup group for group in groups
          @outPorts.out.send message
          @outPorts.out.endGroup() for group in groups

  disconnectMQ: ->
    do @mq.disconnect if @mq
    @mq = null

exports.getComponent = -> new Listen
