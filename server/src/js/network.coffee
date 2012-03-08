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

    jsPlumb.Defaults.Connector = "Bezier"
    jsPlumb.Defaults.PaintStyle =
        strokeStyle: "#5c3566"
        lineWidth: 6 
    jsPlumb.Defaults.DragOptions =
        cursor: "pointer"
        zIndex: 2000

    getNodePosition = (node) ->
        if node.display and node.display.x and node.display.y
            previousPosition = node.display
            return node.display

        previousPosition =
            x: previousPosition.x + 200
            y: previousPosition.y + 50

    jsPlumb.setRenderMode jsPlumb.CANVAS


    jQuery.get "/network/" + jQuery('#network').attr('about'), (data) ->
        jQuery('#uptime').countdown
            since: new Date data.started
            format: "YOWDHM"
            significant: 2

        for node in data.nodes
            domNode = jQuery("##{node.cleanId}")
            domNode.addClass "component"
            
            position = getNodePosition node
            domNode.css "top", position.y
            domNode.css "left", position.x

            node.inEndpoints = {}
            node.outEndpoints = {}

            inAnchors = ["LeftMiddle", "TopLeft", "BottomLeft"]
            outAnchors = ["RightMiddle", "TopRight", "BottonRight"]

            for port,index in node.inPorts
                maxConnections = 1
                if port.type is "array"
                    maxConnections = -1
                node.inEndpoints[port.name] = jsPlumb.addEndpoint domNode,
                    isSource: false
                    isTarget: true
                    maxConnections: maxConnections
                    anchor: inAnchors[index]
                    overlays: [
                      [
                        "Label",
                          location: [-1.5,-0.5]
                          label: port.name
                      ]
                    ]
                , endPoints.obj

            for port,index in node.outPorts
                maxConnections = 1
                if port.type is "array"
                    maxConnections = -1
                node.outEndpoints[port.name] = jsPlumb.addEndpoint domNode,
                    isSource: true
                    isTarget: false
                    maxConnections: maxConnections
                    anchor: outAnchors[index]
                    overlays: [
                      [
                        "Label",
                          location: [2,-0.5]
                          label: port.name
                      ]
                    ]
                , endPoints.obj

            plumbNodes[node.cleanId] = node

            jsPlumb.draggable domNode

        for edge in data.edges
            unless edge.from.node
                continue
            jsPlumb.connect
                source: plumbNodes[edge.from.cleanNode].outEndpoints[edge.from.port]
                target: plumbNodes[edge.to.cleanNode].inEndpoints[edge.to.port]
