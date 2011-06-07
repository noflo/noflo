class Graph
    name: ""
    nodes: []
    edges: []
    initializers: []

    constructor: (name) ->
        @name = name

    addNode: (id, component) ->
        @nodes.push
            id: id
            component: component

    getNode: (id) ->
        for node in @nodes
            if node.id is id
                return node

    addEdge: (outNode, outPort, inNode, inPort) ->
        @edges.push
            from:
                node: outNode
                port: outPort
            to:
                node: inNode
                port: inPort

    addInitial: (data, node, port) ->
        @initializers.push
            from:
                data: data
            to:
                node: node
                port: port

    toDOT: ->
        cleanID = (id) ->
            id.replace /\s*/g, ""

        dot = "digraph {\n"

        for node in @nodes
            dot += "    #{cleanID(node.id)} [shape=box]\n"

        for initializer in @initializers
            dot += "    data -> #{cleanID(initializer.to.node)} [label='#{initializer.to.port}']\n" 

        for edge in @edges
            dot += "    #{cleanID(edge.from.node)} -> #{cleanID(edge.to.node)}[label='#{edge.from.port}']\n"

        dot += "}"

        return dot

exports.createGraph = (name) ->
    new Graph name
