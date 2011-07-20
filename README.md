NoFlo: Flow-based programming for Node.js
=========================================

NoFlo is a simple [flow-based programming](http://en.wikipedia.org/wiki/Flow-based_programming) implementation for Node.js. From WikiPedia:

> In computer science, flow-based programming (FBP) is a programming paradigm that defines applications as networks of "black box" processes, which exchange data across predefined connections by message passing, where the connections are specified externally to the processes. These black box processes can be reconnected endlessly to form different applications without having to be changed internally. FBP is thus naturally component-oriented.

Developers used to the [Unix philosophy](http://en.wikipedia.org/wiki/Unix_philosophy) should be immediately familiar with FBP:

> This is the Unix philosophy: Write programs that do one thing and do it well. Write programs to work together. Write programs to handle text streams, because that is a universal interface.

It also fits well in Alan Kay's [original idea of object-oriented programming](http://userpage.fu-berlin.de/~ram/pub/pub_jf47ht81Ht/doc_kay_oop_en):

> I thought of objects being like biological cells and/or individual computers on a network, only able to communicate with messages (so messaging came at the very beginning -- it took a while to see how to do messaging in a programming language efficiently enough to be useful).

NoFlo has been written in [CoffeeScript](http://jashkenas.github.com/coffee-script) for simplicity. The system is heavily inspired by [J. Paul Morrison's](http://www.jpaulmorrison.com/) book [Flow-Based Programming](http://www.jpaulmorrison.com/fbp/#More). 

For now NoFlo should be treated as an interesting proof-of-concept. If I have time, more functionality will be added and the system made actually usable for real-world business applications.

## Requirements and installing

NoFlo requires a reasonably recent version of [Node.js](http://nodejs.org/), and some [npm](http://npmjs.org/) packages. You can install everything needed by a simple:

    $ npm link

NoFlo is available from [GitHub](https://github.com/bergie/noflo) under the MIT license.

## Running the examples

File line count:

    $ coffee ./examples/linecount/count.coffee somefile.txt

Simple "Hello, world" web service with Basic authentication:

    $ coffee ./examples/http/hello.coffee

Then just point your browser to [http://localhost:8003/](http://localhost:8003/). Note that this example needs to have `connect` NPM package installed. Username is `user` and password is `pass`.

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

Minimal component written in CoffeeScript would look like the following:

    noflo = require "noflo"

    class Forwarder extends noflo.Component
        description: "This component receives data on a single input port and sends the same data out to the output port"

        constructor: ->
            # Register ports
            @inPorts =
                in: new noflo.Port()
            @outPorts =
                out: new noflo.Port()

            @inPorts.in.on "data", (data) =>
                # Forward data when we receive it.
                # Note: send() will connect automatically if needed
                @outPorts.out.send data

            @inPorts.in.on "disconnect", =>
                # Disconnect output port when input port disconnects
                @outPorts.out.disconnect()

    exports.getComponent = ->
        new Forwarder()

This example component register two ports: _in_ and _out_. When it receives data in the _in_ port, it opens the _out_ port and sends the same data there. When the _in_ connection closes, it will also close the _out_ connection. So basically this component would be a simple repeater.

## The NoFlo shell

NoFlo comes with a command shell that you can use to load, run and manipulate NoFlo graphs. For example, the _line count example_ that ships with NoFlo could be built with the shell in the following way:

    $ noflo
    NoFlo>> new countlines
    countlines>> add read ReadFile
    countlines>> add split SplitStr
    countlines>> add count Counter
    countlines>> add display Output
    countlines>> connect read out split in
    countlines>> connect split out count in
    countlines>> connect count count display in
    countlines>> dot
    digraph {
      read [shape=box]
      split [shape=box]
      count [shape=box]
      display [shape=box]
      read -> split[label='out']
      split -> count[label='out']
      count -> display[label='count']
    }
    countlines>> send read source somefile

You can run _help_ to see all available NoFlo shell commands, and _quit_ to get out of the shell.

## NoFlo graph file format

In addition to using NoFlo in _embedded mode_ where you create the FBP graph programmatically ([see example](https://raw.github.com/bergie/noflo/master/examples/linecount/count.coffee)), you can also initialize and run graphs defined using a JSON file.

The NoFlo JSON files declare the processes used in the FBP graph, and the connections between them. They look like the following:

    {
        "properties": {
            "name": "Count lines in a file"
        },
        "processes": {
            "Read File": {
                "component": "ReadFile"
            },
            "Split by Lines": {
                "component": "SplitStr"
            },
            ...
        },
        "connections": [
            {
                "data": "package.json",
                "tgt": {
                    "process": "Read File",
                    "port": "source"
                }
            },
            {
                "src": {
                    "process": "Read File",
                    "port": "out"
                },
                "tgt": {
                    "process": "Split by Lines",
                    "port": "in"
                }
            },
            ...
        ]
    }

To run a graph file, you can either use the _load_ command of the NoFlo shell, or do it programmatically:

    noflo = require "noflo"
    noflo.loadFile "example.json", (network) ->
        console.log "Graph loaded"
        console.log network.graph.toDOT()

## Development

NoFlo development happens on GitHub. Just fork the [main repository](https://github.com/bergie/noflo), make modifications and send a pull request.

### Some ideas

* Browser-based visual programming environment for viewing and editing NoFlo graphs
* Real-time status of the NoFlo graph via socket.io, see where data is flowing
* [Web Workers](https://github.com/pgriess/node-webworker) based multiprocess runner
* Sockets-based multi-computer runner
