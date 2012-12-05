NoFlo: Flow-based programming for Node.js [![Build Status](https://secure.travis-ci.org/bergie/noflo.png?branch=master)](http://travis-ci.org/bergie/noflo)
=========================================

NoFlo is a simple [flow-based programming](http://en.wikipedia.org/wiki/Flow-based_programming) implementation for Node.js. From WikiPedia:

> In computer science, flow-based programming (FBP) is a programming paradigm that defines applications as networks of "black box" processes, which exchange data across predefined connections by message passing, where the connections are specified externally to the processes. These black box processes can be reconnected endlessly to form different applications without having to be changed internally. FBP is thus naturally component-oriented.

Developers used to the [Unix philosophy](http://en.wikipedia.org/wiki/Unix_philosophy) should be immediately familiar with FBP:

> This is the Unix philosophy: Write programs that do one thing and do it well. Write programs to work together. Write programs to handle text streams, because that is a universal interface.

It also fits well in Alan Kay's [original idea of object-oriented programming](http://userpage.fu-berlin.de/~ram/pub/pub_jf47ht81Ht/doc_kay_oop_en):

> I thought of objects being like biological cells and/or individual computers on a network, only able to communicate with messages (so messaging came at the very beginning -- it took a while to see how to do messaging in a programming language efficiently enough to be useful).

NoFlo has been written in [CoffeeScript](http://jashkenas.github.com/coffee-script) for simplicity. The system is heavily inspired by [J. Paul Morrison's](http://www.jpaulmorrison.com/) book [Flow-Based Programming](http://www.jpaulmorrison.com/fbp/#More). 

Currently NoFlo is still in quite early stages. It has already been used in some real-world applications, but the small number of available components still limits the utility of the system.

## Requirements and installing

NoFlo is available [via NPM](https://npmjs.org/package/noflo), so you can install it with:

    $ npm install -g noflo

### Installing from Git

NoFlo requires a reasonably recent version of [Node.js](http://nodejs.org/), and some [npm](http://npmjs.org/) packages. Ensure you have the `coffee-script` package installed (`coffee` command should be available on command line) and NoFlo checked out from Git. Build NoFlo with:

    $ cake build

Then you can install everything needed by a simple:

    $ npm link

NoFlo is available from [GitHub](https://github.com/bergie/noflo) under the MIT license.

## Changes

Please refer to the [CHANGES.md document](https://github.com/bergie/noflo/blob/master/CHANGES.md).

## Using NoFlo

There are two ways to use NoFlo:

* _Independent_: Building the whole control logic of your software as a NoFlo graph, and running it with the `noflo` tool
* _Embedded_: Using NoFlo as a library and calling some NoFlo graphs whenever your software needs workflows

When you create a NoFlo graph, it doesn't do anything by itself. It only loads the components of the graph and sets up the connections between them. Then it is up to the components to actually start sending messages to their outports, or reacting to messages they receive on their inports.

Since most components require some input before they act, the usual way to make a NoFlo graph run is to send it some _initial information packets_, or IIPs. Examples of this would include sending a port number that a web server could listen to the web server component, or sending a file name to a file reader.

This activation model provides many possibilities:

* Starting the graph based on user interaction (shell command, clicking a button)
* Starting the graph based on a received signal (Redis pub/sub, D-Bus signal, WebHook, email)
* Starting the graph at a given time or interval (running a graph on the first of every month, or five minutes from now)
* Starting the graph based on context (when arriving to a physical location, when user goes to a given web site)

### Running the examples

File line count using _embedded_ NoFlo:

    $ coffee ./examples/linecount/count.coffee somefile.txt

File line count as an _individual_ NoFlo application:

    $ noflo -i
    NoFlo>> load examples/linecount/count.json

or

    $ noflo examples/linecount/count.json

Simple "Hello, world" web service with Basic authentication using _embedded_ NoFlo:

    $ coffee ./examples/http/hello.coffee

Then just point your browser to [http://localhost:8003/](http://localhost:8003/). Note that this example needs to have `connect` NPM package installed. Username is `user` and password is `pass`.

## Terminology

* Component: individual, pluggable and reusable piece of software. In this case a NoFlo-compatible CommonJS module
* Graph: the control logic of a FBP application, can be either in programmatical or file format
* Inport: inbound port of a component
* Network: collection of processes connected by sockets. A running version of a graph
* Outport: outbound port of a component
* Process: an instance of a component that is running as part of a graph

## Components

A component is the main ingredient of flow-based programming. Component is a CommonJS module providing a set of input and output port handlers. These ports are used for connecting components to each other.

NoFlo processes (the boxes of a flow graph) are instances of a component, with the graph controlling connections between ports of components.

Since version 0.2.0, NoFlo has been able to utilize components shared via NPM packages. [Read the introductory blog post](http://bergie.iki.fi/blog/distributing-noflo-components/) to learn more.

### Structure of a component

Functionality a component provides:

* List of inports (named inbound ports)
* List of outports (named outbound ports)
* Handler for component initialization that accepts configuration
* Handler for connections for each inport

Minimal component written in CoffeeScript would look like the following:

```coffeescript
noflo = require "noflo"

class Forwarder extends noflo.Component
    description: "This component receives data on a single input 
    port and sends the same data out to the output port"

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
```

This example component register two ports: _in_ and _out_. When it receives data in the _in_ port, it opens the _out_ port and sends the same data there. When the _in_ connection closes, it will also close the _out_ connection. So basically this component would be a simple repeater.

You can find more examples of components in the `components` folder shipping with NoFlo.

### Subgraphs

A NoFlo graph may contain multiple subgraphs, managed by instances of the `Graph` component. Subgraphs are useful for packaging particular flows to be used as a "new component" by other flows. This allows building more advanced functionality by creating reusable graphs of connected components.

The Graph component loads the graph given to it as a new NoFlo network, and looks for unattached ports in it. It then exposes these ports as its own inports or outports. This way a graph containing subgraphs can easily connect data between the main graph and the subgraph.

Unattached ports from the subgraph will be available through naming `ProcessName.port` on the Graph component instance.

Simple example, specifying what file a spreadsheet-parsing subgraph should run with:

```fbp
# Load a subgraph as a new process
'examples/spreadsheet/parse.fbp' -> GRAPH Reader(Graph)
# Send the filename to the component (subgraph)
'somefile.xls' -> READ.SOURCE Reader()
# Display the results
Reader() ENTITIZE.OUT -> IN Display(Output)
```

Just like with components, it is possible to share subgraphs via NPM. You have to register them in your `package.json`, for example:

```json
  "name": "noflo-spreadsheet",
  "noflo": {
    "graphs": {
      "Parse": "./graphs/parse.fbp"
    }
  }
```

After this the subgraph is available as a "virtual component" with the name `spreadsheet/Parse` and can be used just like any other component. Subgraphs exported in this manner can be in either JSON or the `.fbp` format.

### Some words on component design

Components should aim to be reusable, to do one thing and do it well. This is why often it is a good idea to split functionality traditionally done in one function to multiple components. For example, counting lines in a text file could happen in the following way:

* Filename is sent to a _Read File_ component
* _Read File_ reads it and sends the contents onwards to _Split String_ component
* _Split String_ splits the contents by newlines, and sends each line separately to a _Count_ component
* _Count_ counts the number of packets it received, and sends the total to a _Output_ component
* _Output_ displays the number

This way the whole logic of the application is in the graph, in how the components are wired together. And each of the components is easily reusable for other purposes.

If a component requires configuration, the good approach is to set sensible defaults in the component, and to allow them to be overridden via an input port. This method of configuration allows the settings to be kept in the graph itself, or for example to be read from a file or database, depending on the needs of the application.

The components should not depend on a particular global state, either, but instead attempt to keep the input and output ports their sole interface to the external world. There may be some exceptions, like a component that listens for HTTP requests or Redis pub-sub messages, but even in these cases the server, or subscription should be set up by the component itself.

When discussing how to solve the unnecessary complexity of software, _Out of the Tar Pit_ promotes an approach quite similar to the one discussed here:

> The first thing that we’re doing is to advocate separating out all complexity of any kind from the pure logic of the system (which - having nothing to do with either state or control - we’re not really considering part of the complexity).

Done this way, components represent the pure logic, and the control flow and state of the application is managed separately of them in the graph. This separation makes the system a lot simpler.

### Ports and events

Being a flow-based programming environment, the main action in NoFlo happens through ports and their connections. There are several events that can be associated with ports:

* _Attach_: there is a connection to the port
* _Connect_: the port has started sending or receiving a data transmission
* _BeginGroup_: the data stream after this event is associated with a given named group. Components may or may not utilize this information
* _Data_: an individual data packet in a transmission. There might be multiple depending on how a component operates
* _EndGroup_: A particular grouped stream of data ends
* _Disconnect_: end of data transmission
* _Detach_: A connection to the port has been removed

It depends on the nature of the component how these events may be handled. Most typical components do operations on a whole transmission, meaning that they should wait for the _disconnect_ event on inports before they act, but some components can also act on single _data_ packets coming in.

When a port has no connections, meaning that it was initialized without a connection, or a _detach_ event has happened, it should do no operations regarding that port.

## The NoFlo shell

NoFlo comes with a command shell that you can use to load, run and manipulate NoFlo graphs. For example, the _line count_ graph that was explained in _Component design_ could be built with the shell in the following way:

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

## Designing NoFlo graphs with DrawFBP

As of version 2.6 onwards, the [DrawFBP](http://www.jpaulmorrison.com/cgi-bin/wiki.pl?DrawFBP) GUI tool for designing Flow-Based Programming graphs is able to generate graphs compatible with NoFlo.

The graphs can be exported to NoFlo format from the _File -> Generate network -> NoFlo_ menu and then run normally.

## The web-based NoFlo monitor

In addition to the shell, NoFlo also comes with a web interface that allows loaded graphs to be monitored. To start it, load a graph into the NoFlo shell, and run:

    >> startserver 8080

This will start the NoFlo monitor on port `8080` of your system, so browsers can connect to it with `http://localhost:8080`. You can also use another port number.

At the moment the monitor only displays the graph, showing the processes and connections between them. Real-time statistics of data flow, and support for visual graph editing are planned.

## NoFlo graph file format

In addition to using NoFlo in _embedded mode_ where you create the FBP graph programmatically ([see example](https://raw.github.com/bergie/noflo/master/examples/linecount/count.coffee)), you can also initialize and run graphs defined using a JSON file.

The NoFlo JSON files declare the processes used in the FBP graph, and the connections between them. They look like the following:

```json
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
```

To run a graph file, you can either use the _load_ command of the NoFlo shell, or do it programmatically:

```coffeescript
noflo = require "noflo"
noflo.loadFile "example.json", (network) ->
    console.log "Graph loaded"
    console.log network.graph.toDOT()
```

## Language for Flow-Based Programming

In addition to the JSON format described above, FBP has its own Domain-Specific Language (DSL) for easy graph definition. The syntax is the following:

* `'somedata' -> PORT Process(Component)` sends initial data _somedata_ to port _PORT_ of process _Process_ that runs component _Component_
* `A(Component1) X -> Y B(Component2)` sets up a connection between port _X_ of process _A_ that runs component _Component1_ and port _Y_ of process _B_ that runs component _Component2_

You can connect multiple components and ports together on one line, and separate connection definitions with a newline or a comma (`,`). 

Components only have to be specified the first time you mention a new process. Afterwards, simply append empty parentheses (`()`) after the process name.

Example:

```fbp
'somefile.txt' -> SOURCE Read(ReadFile) OUT -> IN Split(SplitStr)
Split() OUT -> IN Count(Counter) COUNT -> IN Display(Output)
Read() ERROR -> IN Display()
```

NoFlo supports the FBP language fully. You can either load a graph with a string of FBP-language commands with:

```coffeescript
fbpData = "<some FBP language connections>"
    
noflo = require "noflo"
noflo.graph.loadFbp fbpData, (graph) ->
    console.log "Graph loaded"
    console.log graph.toDOT()
```

The `.fbp` file suffix is used for files containing FBP language. This means you can load them also the same way as you load JSON files, using the `noflo.loadFile` method, or the NoFlo shell. Example:

    $ noflo examples/linecount/count.fbp     

## Development

NoFlo development happens on GitHub. Just fork the [main repository](https://github.com/bergie/noflo), make modifications and send a pull request.

To run the unit tests you need [nodeunit](https://github.com/caolan/nodeunit). Run the tests with:

    $ nodeunit test

or:

    $ npm test

## Discussion

Flow-based programming in general, including NoFlo can be discussed on the [Flow Based Programming Google group](http://groups.google.com/group/flow-based-programming).

There is also an IRC channel `#fbp` on FreeNode.

### Some ideas

* Real-time status of the NoFlo graph via socket.io, see where data is flowing
* [Web Workers](https://github.com/pgriess/node-webworker) based multiprocess runner
* Sockets-based multi-computer runner, or possibly DNode
