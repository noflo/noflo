model = {}
view = {}

model.Network = Backbone.Model.extend
  defaults:
    nodes: null

  url: -> "/network/#{@id}"

  initialize: (attributes) ->
    attributes ?= {}
    attributes.nodes ?= []
    attributes.edges ?= []

  set: (attributes) ->
    if attributes.nodes
      attributes.nodes = new model.Nodes attributes.nodes,
        network: @
    if attributes.edges
      attributes.edges = new model.Edges attributes.edges,
        network: @
    Backbone.Model::set.call @, attributes

model.Networks = Backbone.Collection.extend
  model: model.Network

  url: "/network"

model.Node = Backbone.Model.extend
  defaults:
    component: ""
    inPorts: null
    outPorts: null
    display:
      x: null
      y: null

  initialize: (attributes) ->
    attributes ?= {}
    attributes.inPorts ?= []
    attributes.outPorts ?= []

  set: (attributes) ->
    if attributes.inPorts
      attributes.inPorts = new model.NodePorts attributes.inPorts,
        node: @
    if attributes.outPorts
      attributes.outPorts = new model.NodePorts attributes.outPorts,
        node: @
    Backbone.Model::set.call @, attributes

  url: -> "#{@collection.url()}/#{@id}"

model.Nodes = Backbone.Collection.extend
  model: model.Node
  network: null

  initialize: (models, options) ->
    @network = options?.network

  url: -> "/network/#{@network.id}/node"

model.Port = Backbone.Model.extend
  node: null

  defaults:
    type: ""
    name: ""
    data: null

model.NodePorts = Backbone.Collection.extend
  model: model.Port
  node: null

  initialize: (models, options) ->
    @node = options?.node

model.Edge = Backbone.Model.extend
  defaults:
    data: null
    from: null
    to: null

  url: -> "#{@collection.url()}/#{@id}"

model.Edges = Backbone.Collection.extend
  model: model.Edge
  network: null

  initialize: (models, options) ->
    @network = options?.network

  url: -> "/network/#{@network.id}/edge"

view.Networks = Backbone.View.extend
  app: null

  initialize: (options) ->
    @app = options?.app

  render: ->
    element = jQuery @el
    element.empty()
    app = @app
    @collection.each (network) ->
      networkElement = jQuery('<div></div>').html network.get 'name'
      networkElement.click -> app.navigate "#/#{network.id}", trigger: true
      element.append networkElement
    @

view.Network = Backbone.View.extend
  nodeViews: null

  initialize: ->
    @nodeViews = {}
    @model.get('nodes').each (node) =>
      @nodeViews[node.id] = new view.Node
        model: node
        tagName: 'div'

    @edgeViews = []
    @model.get('edges').each (edge) =>
      @edgeViews.push new view.Edge
        model: edge
        networkView: @

  render: ->
    document.onselectstart = -> 
      false

    jsPlumb.Defaults.Connector = "Bezier"
    jsPlumb.Defaults.PaintStyle =
      strokeStyle: "#5c3566"
      lineWidth: 6 
    jsPlumb.Defaults.DragOptions =
      cursor: "pointer"
      zIndex: 2000

    jsPlumb.setRenderMode jsPlumb.CANVAS

    element = jQuery @el
    element.empty()

    _(@nodeViews).each (nodeView) ->
      element.append nodeView.render().el
      nodeView.renderPorts()

    _(@edgeViews).each (edgeView) ->
      edgeView.renderConnection()

    jsPlumb.bind 'jsPlumbConnection', (info) ->
      console.log "ATTACH", info
    jsPlumb.bind 'jsPlumbConnectionDetached', (info) =>
      for edgeView in @edgeViews
        continue unless edgeView.connection is info.connection
        console.log "DETACH", edgeView.model
        edgeView.model.destroy
          success: ->
            console.log "CONNECTION DELETED"
          error: ->
            console.log "FAILED TO DELETE CONNECTION"
    @

view.Node = Backbone.View.extend
  inAnchors: ["LeftMiddle", "TopLeft", "BottomLeft"]
  outAnchors: ["RightMiddle", "TopRight", "BottonRight"]
  inEndpoints: null
  outEndpoints: null

  initialize: (options) ->
    @inEndpoints = {}
    @outEndpoints = {}

  render: ->
    element = jQuery @el
    element.empty()
    element.addClass 'component'
    element.css 'top', @model.get('display').x
    element.css 'left', @model.get('display').y
    element.html @model.id

    jsPlumb.draggable @el,
      stop: (event, data) =>
        @model.set
          display:
            x: data.offset.top
            y: data.offset.left
        @model.save
          success: ->
            console.log "SUCCESS"
          error: ->
            console.log "ERROR"
    @

  renderPorts: ->
    nodeView = @
    @model.get('inPorts').each (port, index) ->
      inPortView = new view.Port
        model: port
        inPort: true
        nodeView: nodeView
        anchor: nodeView.inAnchors[index]
      inPortView.render()
      nodeView.inEndpoints[port.get('name')] = inPortView.endPoint

    @model.get('outPorts').each (port, index) ->
      outPortView = new view.Port
        model: port
        inPort: false
        nodeView: nodeView
        anchor: nodeView.outAnchors[index]
      outPortView.render()
      nodeView.outEndpoints[port.get('name')] = outPortView.endPoint
    @

view.Port = Backbone.View.extend
  endPoint: null
  inPort: false
  anchor: "LeftMiddle"

  portDefaults:
    endpoint: [
      'Dot'
      radius: 6
    ]
    paintStyle:
      fillStyle: '#75507b'

  initialize: (options) ->
    @endPoint = null
    @nodeView = options?.nodeView
    @inPort = options?.inPort
    @anchor = options?.anchor

  render: ->
    return @ if @endPoint
    portOptions = 
      isSource: true
      isTarget: false
      maxConnections: 1
      anchor: @anchor
      overlays: [
        [
          "Label"
            location: [2.5,-0.5]
            label: @model.get('name')
        ]
      ]
    if @inPort
      portOptions.isSource = false
      portOptions.isTarget = true
      portOptions.overlays[0][1].location = [-1.5, -0.5]
    if @model.get('type') is 'array'
      portOptions.maxConnections = -1
    @endPoint = jsPlumb.addEndpoint @nodeView.el, portOptions, @portDefaults
    @

view.Edge = Backbone.View.extend
  networkView: null
  connection: null

  initialize: (options) ->
    @networkView = options?.networkView

  render: ->
    @

  renderConnection: ->
    return unless @model.get('from').node

    source = @model.get 'from'
    target = @model.get 'to'

    @connection = jsPlumb.connect
      source: @networkView.nodeViews[source.node].outEndpoints[source.port]
      target: @networkView.nodeViews[target.node].inEndpoints[target.port]

nofloClient = Backbone.Router.extend
  networks: null

  routes:
    '':         'index'
    '/:network': 'network'

  initialize: (options) ->
    @networks = new model.Networks []
    @networks.fetch options

  index: ->
    @networks = new model.Networks []
    @networks.fetch
      success: (networks) =>
        networksView = new view.Networks
          app: @
          collection: networks
          el: jQuery('#noflo')
        networksView.render()

  network: (id) ->
    network = @networks.get id
    network.fetch
      success: ->
        networkView = new view.Network
          model: network
          el: jQuery '#noflo'
        networkView.render()

jsPlumb.bind "ready", ->
  app = new nofloClient
    success: ->
      do Backbone.history.start
    error: ->
      jQuery('#noflo').empty().append jQuery('<div>Failed to fetch networks</div>')

###
    jQuery.get "/network/" + jQuery('#network').attr('about'), (data) ->
        jQuery('#uptime').countdown
            since: new Date data.started
            format: "YOWDHM"
            significant: 2
###
