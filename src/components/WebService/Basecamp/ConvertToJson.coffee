noflo = require "noflo"

class ConvertToJson extends noflo.Component
    constructor: ->
        @id = null

        @inPorts =
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on "connect", (socket) =>
            console.log socket
            @id = socket.id
        @inPorts.in.on "data", (data) =>
            @convert data
        @inPorts.in.on "disconnect", =>
            do @outPorts.out.disconnect
            @id = null

    convert: (data) ->
        converted =
            "@type": "prj:Project"
            "@subject": "#{@id}#{data.id['#']}"
            "prj:name": data.name
            "prj:status": data.status
            "prj:startDate": data['created-on']['#']
            "dc:modified": data['last-changed-on']['#']
        @outPorts.out.send converted

exports.getComponent = ->
    new ConvertToJson
