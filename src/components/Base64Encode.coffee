# This component receives strings or Buffers and sends them out Base64-encoded

noflo = require "../../lib/NoFlo"

class Base64Encode extends noflo.Component
  description: 'Encode a string or buffer to base64'
  constructor: ->
    @data = null
    @encodedData = ""

    # This component has only two ports: an input port
    # and an output port.
    @inPorts =
      in: new noflo.Port
    @outPorts =
      out: new noflo.Port

    # Initialize an empty string for receiving data
    # when we get a connection
    @inPorts.in.on "connect", =>
      @data = ""

    # Process each incoming IP
    @inPorts.in.on "data", (data) =>
      # In case of Buffers we can just encode them
      # immediately
      if data instanceof Buffer
        @encodedData += data.toString "base64"
        return
      # In case of strings we just append to the
      # existing and encode later
      @data += data

    # On disconnection we send out all the encoded
    # data
    @inPorts.in.on "disconnect", =>
      @outPorts.out.send @encodeData()
      @outPorts.out.disconnect()
      @data = null
      @encodedData = ""

  encodeData: ->
    # In case of Buffers we already have encoded data
    # available
    return @encodedData unless @encodedData is ""
    # In case of strings we need to encode the data
    # first
    return new Buffer(@data).toString "base64"

exports.getComponent = -> new Base64Encode
