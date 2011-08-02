jsPlumb.bind "ready", ->
    plumbNodes = {}

    document.onselectstart = -> 
        false

    previousPosition = 
        x: 0
        y: 0

    endPoints =
        obj:
            endpoint: ["Dot",
                radius: 6
            ]
            paintStyle:
                fillStyle: "#75507b"
        data: null
        rdf: null

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
        jQuery('#uptime').countdown
            since: new Date data.started
            format: "YOWDHM"
            significant: 2

        for node in data.nodes
            domNode = jQuery("##{node.id}")
            domNode.addClass "component"
            
            position = getNodePosition node
            domNode.css "top", position.y
            domNode.css "left", position.x

            node.inEndpoints = {}
            node.outEndpoints = {}

            inAnchors = ["LeftMiddle", "TopLeft", "BottomLeft"]
            outAnchors = ["RightMiddle", "TopRight", "BottonRight"]

            for port,index in node.inPorts
                node.inEndpoints[port] = jsPlumb.addEndpoint domNode,
                    isSource: false
                    isTarget: true
                    anchor: inAnchors[index]
                , endPoints.obj

            for port,index in node.outPorts
                node.outEndpoints[port] = jsPlumb.addEndpoint domNode,
                    isSource: true
                    isTarget: false
                    anchor: outAnchors[index]
                , endPoints.obj

            plumbNodes[node.id] = node

            jsPlumb.draggable domNode

        for edge in data.edges
            unless edge.from.node
                continue
            jsPlumb.connect
                source: plumbNodes[edge.from.node].outEndpoints[edge.from.port]
                target: plumbNodes[edge.to.node].inEndpoints[edge.to.port]
                connector: "Bezier"
                paintStyle:
                    strokeStyle: "#5c3566"
                    lineWidth: 6
                overlays: [
                    [ "Label",
                        label: edge.from.port
                        location: 0.2
                        cssClass: "outPort"
                    ],
                    [ "Label",
                        label: edge.to.port
                        location: 0.8
                        cssClass: "inPort"
                    ]
                ]
