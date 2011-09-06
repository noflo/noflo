class Fbp
    matchPort: new RegExp "([A-Z]+)"
    matchComponent: new RegExp "([A-Za-z]+)\\(([A-Za-z\/]+|)\\)"
    matchInitial: new RegExp "\'(.+)\'"
    matchConnection: new RegExp "\-\>"
    matchSeparator: new RegExp "[\\s,\\n]"

    constructor: ->
        @currentNode = {}
        @currentEdge = {}
        @nodes = {}
        @edges = []

    parse: (string) ->
        currentString = ""
        for char, index in string
            checkTerminator = @matchSeparator.exec(char)
            currentString += char unless checkTerminator
            continue unless checkTerminator or index is string.length - 1

            connection = @matchConnection.exec currentString
            if connection
                @handleConnection connection
                currentString = ""
            initial = @matchInitial currentString
            if initial
                @handleInitial initial
                currentString = ""
            component = @matchComponent currentString
            if component
                @handleComponent component
                currentString = ""
            port = @matchPort currentString
            if port
                @handlePort port
                currentString = ""

        json =
            properties: 
                name: ""
            processes: @nodes
            connections: @edges

    handleConnection: ->
        @currentEdge.src.process = @currentNode.name if @currentNode.name

    handleInitial: (initial) ->
        @currentNode =
            data: initial[1]

        @currentEdge =
            data: @currentNode
            tgt: {}
        delete @currentEdge.src if @currentEdge.src

    handleComponent: (component) ->
        @currentNode =
            name: component[1]
            component: component[2]

        @nodes[@currentNode.name] = @currentNode unless @nodes[@currentNode.name]

        if @currentEdge.tgt.port
            @currentEdge.tgt.process = @currentNode.name
            @edges.push @currentEdge
            @currentEdge = 
                src: {}
                tgt: {}
            return
    
    handlePort: (port) ->
        if @currentEdge.data or @currentEdge.src.port
            @currentEdge.tgt =
                port: port[1]
            return
        @currentEdge.src.port = port[1]

exports.Fbp = Fbp
