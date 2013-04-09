noflo = require "../../lib/NoFlo"

class SliceArray extends noflo.Component
  constructor: ->
    @begin = 0
    @end = null

    @inPorts =
      in: new noflo.Port()
      begin: new noflo.Port()
      end: new noflo.Port()
    @outPorts =
      out: new noflo.Port()
      error: new noflo.Port()

    @inPorts.begin.on "data", (data) =>
      @begin = data
    @inPorts.end.on "data", (data) =>
      @end = data

    @inPorts.in.on "begingroup", (group) =>
      @outPorts.out.beginGroup group
    @inPorts.in.on "data", (data) =>
      @sliceData data
    @inPorts.in.on "endgroup", =>
      @outPorts.out.endGroup()
    @inPorts.in.on "disconnect", =>
      @outPorts.out.disconnect()

  sliceData: (data) ->
    unless data.slice
      return @outPorts.error.send "Data #{typeof data} cannot be sliced"
    sliced = data.slice @begin, @end unless @end is null
    sliced = data.slice @begin if @end is null
    @outPorts.out.send sliced

exports.getComponent = -> new SliceArray
