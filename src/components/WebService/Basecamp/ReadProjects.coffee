noflo = require "noflo"
base = require "./BasecampComponent"

class ReadProjects extends base.BasecampComponent
    constructor: ->
        do @basePortSetup
        @outPorts =
            out: new noflo.Port()

        @inPorts.apikey.on "disconnect", =>
            do @readProject if @hostname 
        @inPorts.hostname.on "disconnect", =>
            do @readProject if @apikey

    readProject: ->
        @get "/projects.xml", (data) =>
            @parseProject data

    parseProject: (data) ->
        target = @outPorts.out
        id = "https://#{@hostname}/"
        @parse data, (parsed) ->
            target.send project, id for project in parsed.project
            target.disconnect()
    
exports.getComponent = ->
    new ReadProjects
