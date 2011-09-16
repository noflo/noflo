noflo = require "noflo"

class ReadDocumentAttachment extends noflo.Component
    constructor: ->
        @connection = null
        @document = null
        @attachment = null

        @inPorts =
            connection: new noflo.Port
            document: new noflo.Port
            attachment: new noflo.Port
        @outPorts =
            out: new noflo.Port

        @inPorts.connection.on "data", (data) =>
            @connection = data
            do @readAttachment if @document and @attachment

        @inPorts.document.on "data", (data) =>
            @document = data
            do @readAttachment if @connection and @attachment

        @inPorts.attachment.on "data", (data) =>
            @attachment = data
            do @readAttachment if @connection and @document

    getHeaders: ->
        headers =
            Host: @connection.uri.hostname

        if @connection.uri.auth
            headers.Authorization = "Basic " + new Buffer(@connection.uri.auth, "ascii").toString "base64"

        return headers

    getRequest: (callback) ->
        options =
            host: @connection.uri.hostname
            method: "GET"
            path: "#{@connection.uri.pathname}/#{@document['_id']}/#{@attachment}"
            port: @connection.uri.port
            headers: @getHeaders()

        req = @connection.uri.protocolHandler.request options, callback
        req.end()

    readAttachment: ->
        @getRequest (response) =>
            response.setEncoding "binary"
            body = ""
            port = @outPorts.out
            response.on "data", (chunk) ->
                body += chunk

            response.on "end", ->
                buffer = new Buffer body, "binary"
                port.send buffer
                do port.disconnect

exports.getComponent = -> new ReadDocumentAttachment
