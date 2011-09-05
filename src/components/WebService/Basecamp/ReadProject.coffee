noflo = require "noflo"
https = require "https"
xml2js = require "xml2js"

class ReadProject extends noflo.Component
    constructor: ->
        @apikey = null
        @hostname = null

        @inPorts =
            apikey: new noflo.Port()
            hostname: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.apikey.on "data", (data) =>
            @apikey = data
        @inPorts.hostname.on "data", (data) =>
            @hostname = data
        @inPorts.apikey.on "disconnect", =>
            do @readProject if @hostname 
        @inPorts.hostname.on "disconnect", =>
            do @readProject if @apikey

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

    readProject: ->
        @get "/projects.xml", (data) =>
            @parseProject data

    parseProject: (data) ->
        target = @outPorts.out
        id = "https://#{@hostname}/projects/"
        parser = new xml2js.Parser
        parser.on "end", (projects) ->
            projects.project.forEach (project) ->
                target.send project, id
        parser.parseString data

exports.getComponent = ->
    new ReadProject()
