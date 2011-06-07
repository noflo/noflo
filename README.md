NoFlo: Flow-based programming for Node.js
=========================================

NoFlo is a simple [flow-based programming](http://en.wikipedia.org/wiki/Flow-based_programming) implementation for Node.js. From WikiPedia:

> In computer science, flow-based programming (FBP) is a programming paradigm that defines applications as networks of "black box" processes, which exchange data across predefined connections by message passing, where the connections are specified externally to the processes. These black box processes can be reconnected endlessly to form different applications without having to be changed internally. FBP is thus naturally component-oriented.

It has been written in [CoffeeScript](http://jashkenas.github.com/coffee-script) for simplicity. NoFlo is heavily inspired by [J. Paul Morrison's](http://www.jpaulmorrison.com/) book [Flow-Based Programming](http://www.jpaulmorrison.com/fbp/#More). He writes of FBP:

> Suppose someone told you that an obscure programming technology, in continuous production use at one of Canada's major banks since the 1970s, provides an amazingly simple solution to a number of the major challenges facing today's programmers, including multicore machines and distributed computing, while providing improved maintainability, as well as a much more seamless transition from structured design to running code - would you reject this as a fairy tale, made up by impractical dreamers who know nothing about the application development business? You probably would!

> It's true though! The first implementation of these concepts, now being called "Flow-Based Programming" (FBP), was used to implement significant proportion of the offline applications used by a large N. American bank, servicing around 5,000,000 customers, going live in the mid-1970s. 

For now NoFlo should be treated as an interesting proof-of-concept. If I have time, more functionality will be added and the system made actually usable for real-world business applications.

## Running the examples

File line count:

    $ coffee ./examples/linecount/count.coffee somefile.txt

## Terminology

* Component: individual, pluggable and reusable piece of software. In this case a NoFlo-compatible CommonJS module
* Graph: the control logic of a FBP application, can be either in programmatical or file format
* Inport: inbound port of a component
* Network: collection of processes connected by sockets. A running version of a graph
* Outport: outbound port of a component
* Process: an instance of a component that is running as part of a graph

## Structure of a component

A component is the main ingredient of flow-based programming. Component is a CommonJS module providing a set of input and output port handlers. These ports are used for connecting components to each other.

NoFlo processes (the boxes of a flow graph) are instances of a component, with the graph controlling connections between ports of components.

Functionality a component provides:

* List of inports (named inbound ports)
* List of outports (named outbound ports)
* Handler for component initialization that accepts configuration
* Handler for connections for each inport

Minimal component written in CoffeeScript would look like the following. Please note that this is not the final component API, but instead something used to get the proof-of-concept up and running quickly:

    outSocket = null

    exports.getInputs = ->
        # Register a port named "input" with a handler callback
        input: (socket) ->
            socket.on "data", (data) ->
                # Input received, forward it

                if outSocket.isConnected()
                    # Already connected, just send stuff
                    return outSocket.send data

                outSocket.on "connect", ->
                    outSocket.send data

                socket.on "disconnect", ->
                    outSocket.disconnect()

                outSocket.connect()

    exports.getOutputs = ->
        # Register a port named "output" with a handler callback
        output: (socket) ->
            outSocket = socket

This example component register two ports: _input_ and _output_. When it receives data in the _input_ port, it opens the _output_ port and sends the same data there. When the _input_ connection closes, it will also close the _output_ connection. So basically this component would be a simple repeater.

## Development

NoFlo development happens on GitHub. Just fork the [main repository](https://github.com/bergie/noflo), make modifications and send a pull request.

### Some ideas

* Browser-based visual programming environment for viewing and editing NoFlo graphs
* Real-time status of the NoFlo graph via socket.io, see where data is flowing
* Loading of remote components
