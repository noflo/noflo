noflo = require "noflo"
base = require "./BasecampComponent"

class ReadProject extends base.BasecampComponent
    constructor: ->
        @project = null
        do @basePortSetup

        @inPorts.project = new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.project.on "data", (data) =>
            @project = data
        @inPorts.project.on "disconnect", =>
            do @readProject if @hostname and @apikey
        @inPorts.apikey.on "disconnect", =>
            do @readProject if @hostname and @project
        @inPorts.hostname.on "disconnect", =>
            do @readProject if @apikey and @project

    readProject: ->
        @get "/projects/#{@project}.xml", (data) =>
            @parseProject data

    parseProject: (data) ->
        target = @outPorts.out
        id = "https://#{@hostname}/"
        @parse data, (parsed) ->
            target.beginGroup id
            target.send parsed
            target.endGroup()
            target.disconnect()
    
exports.getComponent = ->
    new ReadProject
