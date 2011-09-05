noflo = require "noflo"
https = require "https"
xml2js = require "xml2js"

class BasecampComponent extends noflo.Component
    basePortSetup: ->
        @apikey = null
        @hostname = null

        @inPorts =
            apikey: new noflo.Port()
            hostname: new noflo.Port()

        @inPorts.apikey.on "data", (data) =>
            @apikey = data
        @inPorts.hostname.on "data", (data) =>
            @hostname = data

    prepareAuth: (token) ->
        encoded = new Buffer("#{token}:X").toString 'base64'
        return "Basic #{encoded}"

    prepareHeaders: (host, token) ->
        "Content-Type": "application/xml"
        Authorization: @prepareAuth token
        Host: host

    get: (path, success) ->
        options =
            host: @hostname
            port: 443
            path: path
            headers: @prepareHeaders @hostname, @apikey
        req = https.get options, (resp) ->
            resp.setEncoding "utf8"
            body = ""
            resp.on "data", (data) ->
                body += data
            resp.on "end", ->
                success(body) 

    parse: (data, success) ->
        parser = new xml2js.Parser
        parser.on "end", (parsed) ->
            success parsed
        parser.parseString data

exports.BasecampComponent = BasecampComponent
