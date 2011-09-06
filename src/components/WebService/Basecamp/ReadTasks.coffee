noflo = require "noflo"
base = require "./BasecampComponent"

class ReadTasks extends base.BasecampComponent
    constructor: ->
        @tasklist = null

        do @basePortSetup
        @inPorts.tasklist = new noflo.Port()

        @outPorts =
            out: new noflo.Port()

        @inPorts.tasklist.on "data", (data) =>
            @tasklist = data
            do @readTasks if @hostname and @apikey

    readTasks: ->
        @get "/todo_lists/#{@tasklist}/todo_items.xml", (data) =>
            @parseTasks data

    parseTasks: (data) ->
        target = @outPorts.out
        id = "https://#{@hostname}/"
        @parse data, (parsed) ->
            return unless parsed['todo-item']

            target.beginGroup id

            unless toString.call(parsed['todo-item']) is '[object Array]'
                target.send parsed['todo-item']
                target.endGroup()
                return target.disconnect()

            target.send task for task in parsed['todo-item']
            target.endGroup()
            target.disconnect()

exports.getComponent = ->
    new ReadTasks
