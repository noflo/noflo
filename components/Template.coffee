# This component receives a templating engine name, a string containing the
# template, and variables for the template. Then it runs the chosen template
# engine and sends resulting templated content to the output port

templateEngine = "jade"
inVariables = null
inTemplate = null
outSocket = null

exports.getInputs = ->
    engine: (socket) ->
        socket.on "data", (data) ->
            templateEngine = data
    options: (socket) ->
        socket.on "data", (data) ->
            inVariables = data
        socket.on "connect", ->
            inVariables = null
        socket.on "disconnect", ->
            if inTemplate
                outSocket.connect()
    template: (socket) ->
        socket.on "data", (data) ->
           inTemplate = data
        socket.on "connect", ->
            inTemplate = null
        socket.on "disconnect", ->
            if inVariables
               outSocket.connect() 

exports.getOutputs = ->
    out: (socket) ->
        outSocket = socket
        socket.on "connect", ->
            templating = require templateEngine
            socket.send templating.render inTemplate, inVariables
            socket.disconnect()
