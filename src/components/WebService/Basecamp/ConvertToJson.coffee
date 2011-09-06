noflo = require "noflo"

class ConvertToJson extends noflo.Component
    constructor: ->
        @id = null

        @inPorts =
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on "begingroup", (group) =>
            @id = group
        @inPorts.in.on "data", (data) =>
            @outPorts.out.send @convert data
        @inPorts.in.on "endgroup", =>
            @id = null
        @inPorts.in.on "disconnect", =>
            do @outPorts.out.disconnect

    convert: (data) ->
        return @convertTaskList data if data['completed-count'] and data['uncompleted-count']
        return @convertTask data if data['completed'] and data['todo-list-id']

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

    convertTask: (data) ->
        json =
            "@type": "prj:Task"
            "@subject": "#{@id}todo_items/#{data.id['#']}"
            "prj:name": data.content
            "prj:taskOf": "#{@id}todo_lists/#{data['todo-list-id']['#']}"
            "dc:created": data['created-at']['#']

        if data['completed-on']
            json['prj:finishDate'] = data['completed-on']['#']

        json

exports.getComponent = ->
    new ConvertToJson
