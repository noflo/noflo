noflo = require "../../lib/NoFlo"

class Base64Encode extends noflo.Component
  constructor: ->
    @data = null
    @encodedData = ""

    @inPorts =
      in: new noflo.Port
    @outPorts =
      out: new noflo.Port

    @inPorts.in.on "connect", =>
      @data = ""
    @inPorts.in.on "data", (data) =>
      if data instanceof Buffer
        @encodedData += data.toString "base64"
        return
      @data += data
    @inPorts.in.on "disconnect", =>
      @outPorts.out.send @encodeData()
      @outPorts.out.disconnect()
      @data = null
      @encodedData = ""

  encodeData: ->
    return @encodedData unless @encodedData is ""
    return new Buffer(@data).toString "base64"

exports.getComponent = -> new Base64Encode
