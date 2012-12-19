fs = require 'fs'

class Fbp
  matchExport: new RegExp "EXPORT=([A-Z\.]+):([A-Z]+)"
  matchPort: new RegExp "([A-Z\.]+)"
  matchComponent: new RegExp "([A-Za-z\.]+)\\(([A-Za-z0-9\/\.]+|)\\)"
  matchComponentGlobal: new RegExp "([A-Za-z\.]+)\\(([A-Za-z0-9\/\.]+|)\\)", "g"
  matchInitial: new RegExp "\'(.*)\'"
  matchConnection: new RegExp "\-\>"
  matchSeparator: new RegExp "[\\s,\\n]"
  matchSubgraph: new RegExp "\n *\\'(.+)\\' *-> *GRAPH *([A-Za-z\\.]+)\\(Graph\\)"

  constructor: ->
    @lastElement = null
    @currentElement = null
    @currentNode = {}
    @currentEdge = {}
    @currentLine = 1
    @nodes = {}
    @edges = []
    @exported = []

  loadFile: (file) ->
    fs.readFileSync file, "utf-8", (err) ->
      throw err if err

  # Compile subgraphs INTO the parent graph
  compileSubgraphs: (string) ->
    loop
      match = string.match(@matchSubgraph)

      # Done when there's no more subgraphs
      unless match?
        return string

      else
        [match, file, name, index, original] = match

        # Get the FBP of the subgraph and compile that first
        fbp = @compileSubgraphs(@loadFile(file))

        # Affix the name to the beginning of all components in the subgraph
        fbp = fbp.replace(@matchComponentGlobal, "#{name}.$1($2)")

        # Replace the graph statement with the FBP
        string = string.replace(match, "\n#{fbp}")


  parse: (string) ->
    currentString = ""
    string = @compileSubgraphs("\n#{string}") # Pad string with newline in case the first line is a graph include

    for char, index in string
      @currentLine++ if char is "\n"

      # Commenting support. Ignore everything from # to newline
      if char is '#' and @currentElement isnt "initial"
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

      continue if currentString is 'EXPORT'
      exported = @matchExport.exec currentString
      if exported
        @handleExported exported
        currentString = ""
      connection = @matchConnection.exec currentString
      if connection
        throw new Error "Port or initial expected, got #{currentString} on line #{@currentLine}" unless @lastElement is "initial" or @lastElement is "port"
        @lastElement = "connection"
        @handleConnection connection
        currentString = ""
      initial = @matchInitial.exec currentString
      if initial
        throw new Error "Newline expected, got #{currentString} on line #{@currentLine}" unless @lastElement is null
        @lastElement = "initial"
        @handleInitial initial
        currentString = ""
      component = @matchComponent.exec currentString
      if component
        throw new Error "Port or newline expected, got #{currentString} on line #{@currentLine}" unless @lastElement is "port" or @lastElement is null
        @lastElement = "component"
        @handleComponent component
        currentString = ""
      port = @matchPort.exec currentString
      if port
        throw new Error "Connection or component expected, got #{currentString} on line #{@currentLine}" unless @lastElement is "connection" or @lastElement is "component"
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
      exports: @exported

  handleExported: (exported) ->
    exportedPort = {}
    exportedPort.private = exported[1].toLowerCase()
    exportedPort.public = exported[2].toLowerCase()
    @exported.push exportedPort

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
    if @currentEdge.data isnt undefined or @currentEdge.src.port
      @currentEdge.tgt =
        port: port[1].toLowerCase()
      return
    @currentEdge.src.port = port[1].toLowerCase()

exports.Fbp = Fbp
