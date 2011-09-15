class Fbp
    matchPort: new RegExp "([A-Z\.]+)"
    matchComponent: new RegExp "([A-Za-z]+)\\(([A-Za-z\/\.]+|)\\)"
    matchInitial: new RegExp "\'(.+)\'"
    matchConnection: new RegExp "\-\>"
    matchSeparator: new RegExp "[\\s,\\n]"

    constructor: ->
        @lastElement = null
        @currentElement = null
        @currentNode = {}
        @currentEdge = {}
        @nodes = {}
        @edges = []

    parse: (string) ->
        currentString = ""
        for char, index in string
            # Commenting support. Ignore everything from # to newline
            if char is '#'
                @currentElement = "comment"
                continue
            if @currentElement is "comment"
                if char is "\n"
                    @currentElement = null
                continue

            if char is "'"
                if @currentElement is "initial"
                    # End of initial data
                    @currentElement = null
                else
                    # Start of initial data
                    @currentElement = "initial"

            checkTerminator = @matchSeparator.exec(char)
            checkTerminator = null if @currentElement is "initial"
            currentString += char unless checkTerminator 
            continue unless checkTerminator or index is string.length - 1

            connection = @matchConnection.exec currentString
            if connection
                throw "Port or initial expected" unless @lastElement is "initial" or @lastElement is "port"
                @lastElement = "connection"
                @handleConnection connection
                currentString = ""
            initial = @matchInitial currentString
            if initial
                throw "Newline expected" unless @lastElement is null
                @lastElement = "initial"
                @handleInitial initial
                currentString = ""
            component = @matchComponent currentString
            if component
                throw "Port or newline expected" unless @lastElement is "port" or @lastElement is null
                @lastElement = "component"
                @handleComponent component
                currentString = ""
            port = @matchPort currentString
            if port
                throw "Connection or component expected" unless @lastElement is "connection" or @lastElement is "component"
                @lastElement = "port"
                @handlePort port
                currentString = ""

            if char is "\n"
                @lastElement = null

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

        if @currentEdge.tgt and @currentEdge.tgt.port
            @currentEdge.tgt.process = @currentNode.name
            @edges.push @currentEdge
            @currentEdge = 
                src: {}
                tgt: {}
            return
        unless @currentEdge.src
            @currentEdge =
                src:
                    process: @currentNode.name
                tgt: {}
    
    handlePort: (port) ->
        if @currentEdge.data or @currentEdge.src.port
            @currentEdge.tgt =
                port: port[1].toLowerCase()
            return
        @currentEdge.src.port = port[1].toLowerCase()

exports.Fbp = Fbp
