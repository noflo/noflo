class Fbp
    matchPort: new RegExp "([A-Z]+)"
    matchComponent: new RegExp "([A-Za-z]+)\\(([A-Za-z\/]+|)\\)"
    matchInitial: new RegExp "\'(.+)\'"
    matchConnection: new RegExp "\-\>"
    matchSeparator: new RegExp "[\\s,\\n]"

    constructor: ->
        @lastElement = null
        @currentNode = {}
        @currentEdge = {}
        @nodes = {}
        @edges = []

    parse: (string) ->
        currentString = ""
        for char, index in string

            # Commenting support. Ignore everything from # to newline
            if char is '#'
                @lastElement = "comment"
                continue
            if @lastElement is "comment"
                if char is "\n"
                    @lastElement = null
                continue

            checkTerminator = @matchSeparator.exec(char)
            currentString += char unless checkTerminator
            continue unless checkTerminator or index is string.length - 1

            connection = @matchConnection.exec currentString
            if connection
                @lastElement = "connection"
                @handleConnection connection
                currentString = ""
            initial = @matchInitial currentString
            if initial
                @lastElement = "initial"
                @handleInitial initial
                currentString = ""
            component = @matchComponent currentString
            if component
                @lastElement = "component"
                @handleComponent component
                currentString = ""
            port = @matchPort currentString
            if port
                @lastElement = "port"
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
            data: @currentNode.data
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
                port: port[1].toLowerCase()
            return
        @currentEdge.src.port = port[1].toLowerCase()

exports.Fbp = Fbp
