noflo = require "../lib/NoFlo"

exports["test simple FBP file"] = (test) ->
    fbpData = """
    'somefile.txt' -> SOURCE Read(ReadFile) OUT -> IN Display(Output)
    """

    noflo.graph.loadFBP fbpData, (graph) ->
        test.equal graph.exports.length, 0
        test.equal graph.edges.length, 1
        test.equal graph.initializers.length, 1
        test.equal graph.nodes.length, 2

        test.done()

exports["test more complicated FBP file"] = (test) ->
    fbpData = """
    '8003' -> LISTEN WebServer(HTTP/Server) REQUEST -> IN Profiler(HTTP/Profiler) OUT -> IN Authentication(HTTP/BasicAuth)
    Authentication() OUT -> IN GreetUser(HelloController) OUT -> IN WriteResponse(HTTP/WriteResponse) OUT -> IN Send(HTTP/SendResponse)
    'hello.jade' -> SOURCE ReadTemplate(ReadFile) OUT -> TEMPLATE Render(Template)
    GreetUser() DATA -> OPTIONS Render() OUT -> STRING WriteResponse()
    """

    noflo.graph.loadFBP fbpData, (graph) ->
        test.equal graph.edges.length, 8
        test.equal graph.initializers.length, 2
        test.equal graph.nodes.length, 8
        test.done()

exports["test strings with whitespace"] = (test) ->
    fbpData = """
    'foo Bar BAZ' -> IN Display(Output)
    """

    noflo.graph.loadFBP fbpData, (graph) ->
        test.equal graph.edges.length, 0
        test.equal graph.initializers.length, 1
        test.equal graph.initializers[0].from.data, "foo Bar BAZ"
        test.equal graph.nodes.length, 1
        test.done()

exports["test empty strings"] = (test) ->
    fbpData = """
    '' -> IN Display(Output)
    """

    noflo.graph.loadFBP fbpData, (graph) ->
        test.equal graph.edges.length, 0
        test.equal graph.initializers.length, 1
        test.equal graph.initializers[0].from.data, ""
        test.equal graph.nodes.length, 1
        test.done()

exports["test strings with comments"] = (test) ->
    fbpData = """
    # Do more
    'foo bar' -> IN Display(Output) # Do stuff
    """

    noflo.graph.loadFBP fbpData, (graph) ->
        test.equal graph.edges.length, 0
        test.equal graph.initializers.length, 1
        test.equal graph.initializers[0].from.data, "foo bar"
        test.equal graph.nodes.length, 1
        test.done()

exports["test invalid syntax"] = (test) ->
    fbpData = """
    'foo' -> Display(Output)
    """

    test.throws ->
        noflo.graph.loadFBP fbpData, (graph) ->

    test.done()

exports["test exporting ports"] = (test) ->
    fbpData = """
    EXPORT=READ.IN:FILENAME
    Read(ReadFile) OUT -> IN Display(Output) 
    """
    noflo.graph.loadFBP fbpData, (graph) ->
        test.equal graph.edges.length, 1
        test.equal graph.initializers.length, 0
        test.equal graph.exports.length, 1
        test.equal graph.exports[0].private, 'read.in'
        test.equal graph.exports[0].public, 'filename'
        test.done()

exports["test node metadata"] = (test) ->
    fbpData = """
    Read(ReadFile) OUT -> IN Display(Output:foo) 
    # And we drop the rest
    Display() OUT -> IN Drop(Drop:foo)
    """
    noflo.graph.loadFBP fbpData, (graph) ->
        test.equal graph.edges.length, 2
        test.equal graph.initializers.length, 0
        test.equal graph.exports.length, 0

        for node in graph.nodes
          switch node.id
            when 'Display', 'Drop'
              test.ok node.metadata
              test.ok node.metadata.routes
              test.equal node.metadata.routes[0], 'foo'
            else
              test.ok node.metadata
              test.equal node.metadata.routes, undefined

        test.done()

