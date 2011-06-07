# This component receives a HTTP request (req, res, next) combination on
# on input, and runs res.end(), sending the response to the user

exports.getInputs = ->
    in: (socket) ->
        sendRequest = null
        socket.on "data", (request) ->
            sendRequest = request
        socket.on "disconnect", (request) ->
            sendRequest.res.end()
