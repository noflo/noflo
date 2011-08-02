jsPlumb.bind "ready", ->
    plumbNodes = {}

    document.onselectstart = -> 
        false

    previousPosition = 
        x: 0
        y: 0

    getNodePosition = (node) ->
        if node.display and node.display.x and node.display.y
            previousPosition = node.display
            return node.display

        previousPosition =
            x: previousPosition.x + 200
            y: previousPosition.y + 50

    jsPlumb.setRenderMode jsPlumb.CANVAS
    jsPlumb.setMouseEventsEnabled true
    jsPlumb.Defaults.DragOptions =
        cursor: "pointer"
        zIndex: 2000

    jQuery.get "/network/" + jQuery('#network').attr('about'), (data) ->
        for node in data.nodes
            domNode = jQuery("##{node.id}")
            domNode.css "width", "100px"
            domNode.css "height", "50px"
            domNode.css "margin", "2px"
            domNode.css "border", "2px solid black"
            domNode.css "background", "#ffffff"
            domNode.css "position", "absolute"
            
            position = getNodePosition node
            domNode.css "top", position.y
            domNode.css "left", position.x

            node.inEndpoints = {}
            node.outEndpoints = {}

            inAnchors = ["LeftMiddle", "TopLeft", "BottomLeft"]
            outAnchors = ["RightMiddle", "TopRight", "BottonRight"]

            for port,index in node.inPorts
                node.inEndpoints[port] = jsPlumb.addEndpoint domNode,
                    endpoint: ["Rectangle",
                        width: 10
                        height: 10
                    ] 
                    isSource: false
                    isTarget: true
                    paintStyle:
                        fillStyle: "#ff0000"
                    anchor: inAnchors[index]

            for port,index in node.outPorts
                node.outEndpoints[port] = jsPlumb.addEndpoint domNode,
                    endpoint: ["Rectangle",
                        width: 10
                        height: 10
                    ]
                    isSource: true
                    isTarget: false
                    paintStyle:
                        fillStyle: "#00ff00"
                    anchor: outAnchors[index]

            plumbNodes[node.id] = node

            jsPlumb.draggable domNode

        for edge in data.edges
            unless edge.from.node
                continue
            jsPlumb.connect
                source: plumbNodes[edge.from.node].outEndpoints[edge.from.port]
                target: plumbNodes[edge.to.node].inEndpoints[edge.to.port]
                connector: "Flowchart"
