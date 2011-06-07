# The SplitStr component receives a string in the in port, splits it by
# string specified in the delimiter port, and send each part as a separate
# packet to the out port

delimiterString = "\n"
outSocket = null

exports.getInputs = ->
    delimiter: (socket) ->
        socket.on "data", (data) ->
            delimiterString = data
    in: (socket) ->
        string = ""
        socket.on "data", (data) ->
            string += data
        socket.on "disconnect", ->
            outSocket.on "connect", ->
                string.split(delimiterString).forEach (line) ->
                    outSocket.send line
                outSocket.disconnect()
            outSocket.connect()

exports.getOutputs = ->
    out: (socket) ->
       outSocket = socket 
