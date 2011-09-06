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
        return @convertHour data if data['hours'] and data['person-id']

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
            "prj:inProject": "#{@id}projects/#{data['project-id']['#']}"

    convertTask: (data) ->
        json =
            "@type": "prj:Task"
            "@subject": "#{@id}todo_items/#{data.id['#']}"
            "prj:name": data.content
            "prj:inTaskList": "#{@id}todo_lists/#{data['todo-list-id']['#']}"
            "dc:created": data['created-at']['#']

        if data['completed-on']
            json['prj:finishDate'] = data['completed-on']['#']

        json

    convertHour: (data) ->
        json =
            "@type": "prj:Session"
            "@subject": "#{@id}time_entries/#{data.id['#']}"
            "prj:submittedDate": data.date['#']
            "prj:duration": parseFloat(data.hours['#'])
            "dc:description": data.description
            "prj:reporter": "#{@id}people/#{data['person-id']['#']}"
            "prj:inProject": "#{@id}projects/#{data['project-id']['#']}"
        
        if data['todo-item-id']
            json['prj:inTask'] = "#{@id}todo_items/#{data['todo-item-id']['#']}"

        json


exports.getComponent = ->
    new ConvertToJson
