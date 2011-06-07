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
        dot = "digraph {\n"

        for edge in @edges
            unless edge.from.node
                edge.from.node = "undefined"

            dot += "    #{edge.from.node.replace(' ', '')} -> #{edge.to.node.replace(' ', '')}[label='#{edge.from.port}']\n"

        dot += "}"

        return dot

exports.createGraph = (name) ->
    new Graph name
