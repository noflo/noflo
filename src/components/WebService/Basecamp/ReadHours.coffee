noflo = require "noflo"
base = require "./BasecampComponent"

class ReadHours extends base.BasecampComponent
    constructor: ->
        @project = null
        do @basePortSetup

        @inPorts.project = new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.project.on "data", (data) =>
            @project = data
        @inPorts.project.on "disconnect", =>
            do @readHours if @hostname and @apikey
        @inPorts.apikey.on "disconnect", =>
            do @readHours if @hostname and @project
        @inPorts.hostname.on "disconnect", =>
            do @readHours if @apikey and @project

    readHours: ->
        @get "/projects/#{@project}/time_entries.xml", (data) =>
            @parseHours data

    parseHours: (data) ->
        target = @outPorts.out
        id = "https://#{@hostname}/"
        @parse data, (parsed) ->
            target.beginGroup id
            target.send entry for entry in parsed['time-entry']
            target.endGroup()
            target.disconnect()
    
exports.getComponent = ->
    new ReadHours
