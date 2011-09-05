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
        id = "https://#{@hostname}/projects/"
        @parse data, (parsed) ->
            parsed.project.forEach (project) ->
                target.send project, id

exports.getComponent = ->
    new ReadProjects
