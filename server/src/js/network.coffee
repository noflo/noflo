plumbNodes = {}

addPort = (node, port, inPort, anchor, endpointProto) ->
  portOptions = 
    isSource: true
    isTarget: false
    maxConnections: if port.type is "array" then -1 else 1
    anchor: anchor
    overlays: [
      [
        "Label"
          location: [2.5,-0.5]
          label: port.name
      ]
    ]

  if inPort
    portOptions.isSource = false
    portOptions.isTarget = true
    portOptions.overlays[0][1].location = [-1.5, -0.5]

  endPoint = jsPlumb.addEndpoint node.domNode, portOptions, endpointProto

addComponent = (node, endPoints) ->
  domNode = jQuery("##{node.cleanId}")
  domNode.addClass "component"
  node.domNode = domNode
            
  position = getNodePosition node
  domNode.css "top", position.y
  domNode.css "left", position.x

  node.inEndpoints = {}
  node.outEndpoints = {}

  inAnchors = ["LeftMiddle", "TopLeft", "BottomLeft"]
  outAnchors = ["RightMiddle", "TopRight", "BottonRight"]

  for port, index in node.inPorts
    node.inEndpoints[port.name] = addPort node, port, true, inAnchors[index], endPoints.obj

  for port,index in node.outPorts
    node.outEndpoints[port.name] = addPort node, port, false, outAnchors[index], endPoints.obj

  plumbNodes[node.cleanId] = node
  jsPlumb.draggable domNode

getNodePosition = (node) ->
  previousPosition ?= 
    x: 0
    y: 0
 
  if node.display and node.display.x and node.display.y
    previousPosition = node.display
    return node.display

  previousPosition =
    x: previousPosition.x + 200
    y: previousPosition.y + 50

jsPlumb.bind "ready", ->
    document.onselectstart = -> 
        false

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

    jsPlumb.setRenderMode jsPlumb.CANVAS


    jQuery.get "/network/" + jQuery('#network').attr('about'), (data) ->
        jQuery('#uptime').countdown
            since: new Date data.started
            format: "YOWDHM"
            significant: 2

        addComponent node, endPoints for node in data.nodes

        for edge in data.edges
            unless edge.from.node
                continue
            jsPlumb.connect
                source: plumbNodes[edge.from.cleanNode].outEndpoints[edge.from.port]
                target: plumbNodes[edge.to.cleanNode].inEndpoints[edge.to.port]
