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
            @outPorts.out.send @convert data
        @inPorts.in.on "disconnect", =>
            do @outPorts.out.disconnect
            @id = null

    convert: (data) ->
        return @convertTaskList data if data['completed-count'] and data['uncompleted-count']

        json = 
            "@type": "prj:Project"
            "@subject": "#{@id}projects/#{data.id['#']}"
            "prj:name": data.name
            "prj:status": data.status
            "prj:startDate": data['created-on']['#']
            "dc:modified": data['last-changed-on']['#']

    convertTaskList: (data) ->
        json =  
            "@type": "prj:TaskList"
            "@subject": "#{@id}todo_lists/#{data.id['#']}"
            "prj:name": data.name
            "prj:taskListOf": "#{@id}projects/#{data['project-id']['#']}"

exports.getComponent = ->
    new ConvertToJson
